// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Pull up to N newest messages each click (fast)
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100); // default 20

  // 1) Look up newest message we’ve already stored
  let sinceDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // fallback: last 3 days
  try {
    const { data: newest, error } = await supabase
      .from('inbox_messages')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && newest?.created_at) {
      const newestTs = new Date(new Date(newest.created_at).getTime());
      // Back off one hour to be safe about timezone/IMAP date rounding
      sinceDate = new Date(newestTs.getTime() - 60 * 60 * 1000);
    }
  } catch (_) {
    /* ignore and use fallback */
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
  });

  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock('INBOX');

    // 2) Ask IMAP for anything newer than what we already have
    // (Don’t filter by \Seen so we never miss something newly delivered then auto-seen)
    const uids = await client.search({ since: sinceDate });
    if (!uids?.length) {
      return res.status(200).json({ status: 'no-new', fetched: 0, since: sinceDate.toISOString() });
    }

    // 3) Take the newest N and fetch lightweight metadata
    const selected = uids.slice(-limit);
    let fetched = 0;

    for await (const msg of client.fetch(selected, { envelope: true, flags: true, internalDate: true })) {
      const env = msg.envelope || {};
      const gm = msg.gmailMessageId ? String(msg.gmailMessageId) : null; // Gmail-only; harmless if null
      const stable_id = gm || env.messageId || String(msg.uid);

      const from_addr = env.from?.[0]?.address || env.from?.[0]?.name || '';
      const subject   = env.subject || '';
      const created_at = env.date ? new Date(env.date) : new Date();

      // 4) UPSERT so duplicates never explode
      const { error: upsertErr } = await supabase
        .from('inbox_messages')
        .upsert(
          [{
            msg_id: stable_id,
            gm_msgid: gm,
            uid: msg.uid,
            from_addr,
            subject,
            body: '',              // body is lazy-loaded on click
            created_at,
            direction: 'inbound',
          }],
          { onConflict: 'msg_id' }
        );

      if (!upsertErr) fetched++;
    }

    return res.status(200).json({
      status: 'completed',
      fetched,
      since: sinceDate.toISOString(),
      limit,
    });
  } catch (err) {
    console.error('IMAP sync error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    try { if (lock) lock.release(); } catch {}
    try { await client.logout(); } catch {}
  }
}

// pages/api/cron/inbox-process.js
import { ImapFlow } from 'imapflow';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Pull up to N newest messages per click (fast)
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  // 1) Find newest message stored; back off 1 hour as cushion
  let sinceDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // fallback: last 3 days
  try {
    const { data: newest, error } = await supabase
      .from('inbox_messages')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && newest?.created_at) {
      const ts = new Date(new Date(newest.created_at).getTime());
      sinceDate = new Date(ts.getTime() - 60 * 60 * 1000); // minus 1h
    }
  } catch { /* ignore */ }

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

    // 2) Anything newer than our cushion (don’t filter by \Seen so we never miss)
    const uids = await client.search({ since: sinceDate });
    if (!uids?.length) {
      return res.status(200).json({ status: 'no-new', fetched: 0, since: sinceDate.toISOString() });
    }

    // Newest N
    const selected = uids.slice(-limit);

    // 3) Fetch lightweight metadata (no BODY parsing here)
    let fetched = 0;
    for await (const msg of client.fetch(selected, { envelope: true, flags: true, internalDate: true })) {
      const env = msg.envelope || {};
      // Use RFC Message-ID when available (lets us refetch body later by header)
      const stable_id = env.messageId || String(msg.uid);

      const from_addr  = env.from?.[0]?.address || env.from?.[0]?.name || '';
      const subject    = env.subject || '';
      const created_at = env.date ? new Date(env.date) : new Date();

      // 4) UPSERT ONLY columns that exist in your table
      const { error: upsertErr } = await supabase
        .from('inbox_messages')
        .upsert(
          [{
            msg_id: stable_id,
            from_addr,
            subject,
            body: '',          // body loads via /api/message-body on demand
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

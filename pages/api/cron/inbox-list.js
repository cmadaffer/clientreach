import { ImapFlow } from 'imapflow';

export default async function handler(req, res) {
  try {
    const client = new ImapFlow({
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT || 993),
      secure: String(process.env.IMAP_SECURE ?? 'true') !== 'false',
      auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
      logger: false,
      socketTimeout: 20000,
      tls: { servername: process.env.IMAP_HOST }
    });

    await client.connect();

    // Prefer All Mail on Gmail, otherwise INBOX
    const box = String(process.env.IMAP_HOST).includes('gmail') ? '[Gmail]/All Mail' : 'INBOX';
    const lock = await client.getMailboxLock(box);

    const out = [];
    try {
      // newest 20 by UID
      const uids = await client.search({}); // all
      uids.sort((a,b) => (a < b ? 1 : -1));
      const newest = uids.slice(0, 20);

      const fetcher = client.fetch({ uid: newest }, { envelope: true, flags: true, internalDate: true });
      for await (const msg of fetcher) {
        out.push({
          uid: msg.uid,
          date: msg.internalDate?.toISOString?.() || null,
          seen: msg.flags?.has('\\Seen') || false,
          subject: msg.envelope?.subject || '',
          from: (msg.envelope?.from || []).map(p => `${p.name || ''} <${p.address || ''}>`).join(', ')
        });
      }
    } finally {
      lock.release();
      await client.logout().catch(()=>{});
    }

    res.status(200).json({ ok: true, mailbox: box, count: out.length, messages: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

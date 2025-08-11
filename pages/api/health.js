// pages/api/health.js
export default async function handler(req, res) {
  try {
    res.status(200).json({ ok: true, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

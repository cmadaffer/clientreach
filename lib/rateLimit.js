// lib/rateLimit.js
// Simple in-memory rate limiter per IP.
// Usage: const ok = rateLimit({ key:'foo', limit:3, intervalMs:10000 })(req,res);
const buckets = new Map();

export function rateLimit({ key = 'default', limit = 3, intervalMs = 10_000 } = {}) {
  return (req, res) => {
    try {
      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
        .toString()
        .split(',')[0]
        .trim();
      const k = `${key}:${ip}`;
      const now = Date.now();
      const arr = buckets.get(k) || [];
      // remove old
      while (arr.length && now - arr[0] > intervalMs) arr.shift();
      if (arr.length >= limit) {
        res.status(429).json({ error: 'Too many requests. Please wait.' });
        return false;
      }
      arr.push(now);
      buckets.set(k, arr);
      return true;
    } catch (e) {
      // fail open
      return true;
    }
  };
}


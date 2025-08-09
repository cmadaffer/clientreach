// lib/rateLimit.js
// In-memory per-instance rate limiter. Good enough for Render.
// Limits N requests per interval per IP per key.

const buckets = new Map();

export function rateLimit({ intervalMs = 5000, limit = 3, key = "default" } = {}) {
  return (req, res) => {
    try {
      const rawIp =
        (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown")
          .toString()
          .split(",")[0]
          .trim();

      const k = `${key}:${rawIp}`;
      const now = Date.now();
      const recent = (buckets.get(k) || []).filter((t) => now - t < intervalMs);
      recent.push(now);
      buckets.set(k, recent);

      if (recent.length > limit) {
        res.status(429).json({ error: "Too many requests. Please wait a few seconds." });
        return false;
      }
      return true;
    } catch (e) {
      // If anything weird, allow one request rather than crashing
      return true;
    }
  };
}

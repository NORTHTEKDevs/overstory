/** Per-instance limiter — the CDN cache and size caps do the heavy lifting; this is the
 * backstop against hot loops on one function instance. Nothing persisted, by design. */
const hits = new Map<string, { count: number; windowStart: number }>();

export const rateLimit = (key: string, max = 20, windowMs = 3_600_000): boolean => {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    hits.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
};

/**
 * In-memory per-IP rate limiter for the free `know_about_jenil` tool.
 * Leaky under horizontal scale (per-instance buckets) — acceptable for v1;
 * the upgrade path is to swap the backend for Upstash Redis without changing
 * this surface.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOk {
  ok: true;
}
export interface RateLimited {
  ok: false;
  retryAfterSec: number;
}

export function checkRateLimit(
  ip: string,
  perMinute = 60,
): RateLimitOk | RateLimited {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    // Opportunistically prune expired entries so the Map can't grow unbounded.
    if (buckets.size > 5_000) {
      for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    }
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return { ok: true };
  }
  if (bucket.count >= perMinute) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

/** Extract a best-effort client IP from request headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

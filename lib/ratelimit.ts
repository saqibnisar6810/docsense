// Simple fixed-window limiter per visitor. It lives in server memory, so on
// serverless hosting each instance keeps its own count. That's enough to stop
// one visitor from burning through the free model quota on a public demo.

const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;

export function checkRateLimit(key: string, limit = Number(process.env.RATE_LIMIT_PER_HOUR || 20)) {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, remaining: limit - entry.count };
}


export const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();

import { prisma } from "./db";

/**
 * Database-backed sliding-window rate limiter. Works across multiple app
 * instances. Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000);
  const count = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
  if (count >= limit) return false;
  await prisma.rateLimitHit.create({ data: { key } });
  // Opportunistic cleanup of very old rows
  if (Math.random() < 0.02) {
    await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
  }
  return true;
}

/** Counts recent hits without recording a new one. */
export async function rateLimitCount(key: string, windowSeconds: number): Promise<number> {
  return prisma.rateLimitHit.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowSeconds * 1000) } } });
}

export async function recordRateLimitHit(key: string) {
  await prisma.rateLimitHit.create({ data: { key } });
}

/**
 * Client IP from proxy headers. Uses the LAST X-Forwarded-For entry, which is
 * appended by our hosting proxy; earlier entries can be supplied by the client.
 */
export function ipFromHeaders(h: { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return h.get("x-real-ip") ?? "unknown";
}

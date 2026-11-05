import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";

/**
 * Durable Postgres-backed job queue.
 *  - enqueue() is idempotent when an idempotencyKey is supplied.
 *  - claimJobs() uses FOR UPDATE SKIP LOCKED so multiple workers are safe.
 *  - Failed jobs retry with exponential backoff, then move to DEAD.
 */
export type JobHandler = (payload: Record<string, unknown>, job: { id: string; attempts: number }) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export function hasHandler(type: string) {
  return handlers.has(type);
}

export async function enqueueJob(
  type: string,
  payload: Record<string, unknown>,
  opts: { idempotencyKey?: string; runAt?: Date; maxAttempts?: number; tx?: Tx } = {},
): Promise<{ id: string; created: boolean }> {
  const client = opts.tx ?? prisma;
  if (opts.idempotencyKey) {
    const existing = await client.job.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
    if (existing) return { id: existing.id, created: false };
  }
  try {
    const job = await client.job.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        idempotencyKey: opts.idempotencyKey,
        runAt: opts.runAt ?? new Date(),
        maxAttempts: opts.maxAttempts ?? 5,
      },
    });
    return { id: job.id, created: true };
  } catch (err) {
    // Unique violation from a concurrent enqueue with the same key
    if ((err as { code?: string }).code === "P2002" && opts.idempotencyKey) {
      const existing = await client.job.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
      if (existing) return { id: existing.id, created: false };
    }
    throw err;
  }
}

export function backoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

async function claimJobs(workerId: string, limit: number) {
  // Also reclaim jobs whose worker died (locked > 10 minutes ago).
  return prisma.$queryRaw<{ id: string; type: string; payload: Record<string, unknown>; attempts: number; maxAttempts: number }[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE ("status" IN ('PENDING','FAILED') AND "runAt" <= now())
         OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

export async function runDueJobs(opts: { workerId?: string; limit?: number } = {}): Promise<{ processed: number; failed: number }> {
  const workerId = opts.workerId ?? `worker-${process.pid}`;
  const jobs = await claimJobs(workerId, opts.limit ?? 20);
  let failed = 0;
  for (const job of jobs) {
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type ${job.type}`);
      await handler(job.payload, { id: job.id, attempts: job.attempts });
      await prisma.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), lockedAt: null, lastError: null } });
    } catch (err) {
      failed++;
      const message = (err as Error).message?.slice(0, 1000) ?? "Unknown error";
      const dead = job.attempts >= job.maxAttempts;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: dead ? "DEAD" : "FAILED",
          lastError: message,
          lockedAt: null,
          runAt: new Date(Date.now() + backoffMs(job.attempts)),
        },
      });
    }
  }
  return { processed: jobs.length, failed };
}

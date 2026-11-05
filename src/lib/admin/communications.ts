import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import "@/lib/email/send"; // registers the email.send job handler
import { hasHandler, runDueJobs } from "@/lib/jobs/queue";
import { AdminError, assertCan, parseOrThrow, zOptText, zText, type Actor } from "./common";

export const CHANNELS = ["EMAIL", "SMS", "PHONE", "IN_PERSON", "NOTE"] as const;
export const COMM_STATUSES = ["QUEUED", "SENT", "FAILED", "SKIPPED", "LOGGED"] as const;

export type CommunicationFilters = { channel?: string; status?: string; template?: string; q?: string };

export function communicationWhere(f: CommunicationFilters): Prisma.CommunicationWhereInput {
  const where: Prisma.CommunicationWhereInput = {};
  if (f.channel && (CHANNELS as readonly string[]).includes(f.channel)) where.channel = f.channel as (typeof CHANNELS)[number];
  if (f.status && (COMM_STATUSES as readonly string[]).includes(f.status)) where.status = f.status as (typeof COMM_STATUSES)[number];
  if (f.template) where.templateKey = f.template;
  const q = f.q?.trim();
  if (q) {
    const parts = q.split(/\s+/).slice(0, 3);
    where.OR = [
      { toAddress: { contains: q, mode: "insensitive" } },
      { customer: { AND: parts.map((p) => ({ OR: [{ firstName: { contains: p, mode: "insensitive" as const } }, { lastName: { contains: p, mode: "insensitive" as const } }] })) } },
    ];
  }
  return where;
}

const logSchema = z.object({
  customerId: z.string({ error: "Please choose a customer." }).trim().min(1, "Please choose a customer."),
  channel: z.enum(["PHONE", "NOTE"], { error: "Please choose phone call or note." }),
  direction: z.enum(["INBOUND", "OUTBOUND"]).default("OUTBOUND"),
  subject: zText("Summary", 200),
  body: zOptText("Details", 5000),
});

/** Records a phone call or staff note against a customer. */
export async function logCommunication(actor: Actor, input: z.input<typeof logSchema> | Record<string, unknown>) {
  assertCan(actor, "communications:view");
  const v = parseOrThrow(logSchema, input);
  const customer = await prisma.customer.findUnique({ where: { id: v.customerId }, select: { id: true, phone: true } });
  if (!customer) throw new AdminError("That customer no longer exists.");
  const comm = await prisma.communication.create({
    data: {
      channel: v.channel,
      direction: v.channel === "NOTE" ? "INTERNAL" : v.direction,
      customerId: customer.id,
      toAddress: v.channel === "PHONE" ? customer.phone : null,
      subject: v.subject,
      bodyPreview: v.body,
      status: "LOGGED",
      createdById: actor.id,
      sentAt: new Date(),
    },
  });
  await audit({ actorUserId: actor.id, action: "communication.log", entityType: "Communication", entityId: comm.id, metadata: { channel: v.channel, customerId: customer.id } });
  return comm;
}

export async function searchCustomers(q: string, limit = 10) {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];
  const parts = term.split(/\s+/).slice(0, 3);
  const rows = await prisma.customer.findMany({
    where: {
      OR: [
        { AND: parts.map((p) => ({ OR: [{ firstName: { contains: p, mode: "insensitive" as const } }, { lastName: { contains: p, mode: "insensitive" as const } }, { preferredName: { contains: p, mode: "insensitive" as const } }] })) },
        { email: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: limit,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  return rows.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, detail: [c.phone, c.email].filter(Boolean).join(" · ") }));
}

/** Puts a FAILED or DEAD job back in the queue to run immediately. */
export async function retryJob(actor: Actor, jobId: string) {
  assertCan(actor, "settings:manage");
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AdminError("That job no longer exists.");
  if (job.status !== "FAILED" && job.status !== "DEAD") throw new AdminError("Only failed or dead jobs can be retried.");
  await prisma.job.update({ where: { id: jobId }, data: { status: "PENDING", runAt: new Date(), attempts: 0, lockedAt: null, lockedBy: null } });
  // A failed email's Communication goes back to QUEUED so the handler will deliver it.
  const commId = (job.payload as { communicationId?: unknown } | null)?.communicationId;
  if (job.type === "email.send" && typeof commId === "string") {
    await prisma.communication.updateMany({ where: { id: commId, status: "FAILED" }, data: { status: "QUEUED", statusReason: null } });
  }
  await audit({ actorUserId: actor.id, action: "job.retry", entityType: "Job", entityId: jobId, metadata: { type: job.type } });
}

/**
 * Runs due jobs in this process. Refuses when due jobs of a type with no
 * handler registered here exist, rather than failing them; those need the
 * background worker.
 */
export async function runJobsNow(actor: Actor): Promise<{ processed: number; failed: number }> {
  assertCan(actor, "settings:manage");
  const due = await prisma.job.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, runAt: { lte: new Date() } },
    distinct: ["type"],
    select: { type: true },
  });
  const unhandled = due.map((d) => d.type).filter((t) => !hasHandler(t));
  if (unhandled.length) {
    throw new AdminError(`Some due jobs (${unhandled.join(", ")}) are processed by the background worker (npm run worker), not from this page.`);
  }
  const result = await runDueJobs({ workerId: `admin-${actor.id}`, limit: 50 });
  await audit({ actorUserId: actor.id, action: "job.run_due", entityType: "Job", metadata: { processed: result.processed, failed: result.failed } });
  return result;
}

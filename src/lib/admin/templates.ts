import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { DEFAULT_TEMPLATES } from "@/lib/email/defaults";
import { extractVariables, renderEmail, type RenderedEmail } from "@/lib/email/render";
import { businessMergeVars, deliverQueuedEmail, queueTemplatedEmail } from "@/lib/email/send";
import { deliveryDecision } from "@/lib/email/provider";
import { hasHandler, runDueJobs } from "@/lib/jobs/queue";
import { zEmail } from "@/lib/forms";
import { AdminError, assertCan, parseOrThrow, zBool, type Actor } from "./common";

const PERM = "templates:manage" as const;

const templateSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required.")
    .max(200, "Subject is too long (200 characters max).")
    .refine((v) => !/[\r\n]/.test(v), "Subject must be a single line."),
  body: z.string().trim().min(1, "Body is required.").max(20_000, "Body is too long."),
  isActive: zBool,
});

/** Variables available to a template: those used by the default plus its sample variables. */
export function templateVariables(key: string): string[] {
  const def = DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!def) return [];
  const base = ["businessName", "businessPhone", "businessEmail", "phoneSentence", "bookingUrl", "portalUrl"];
  return [...new Set([...extractVariables(def.subject), ...extractVariables(def.body), ...Object.keys(def.sampleVars), ...base])].sort();
}

export function sampleVarsFor(key: string): Record<string, string> {
  return DEFAULT_TEMPLATES.find((t) => t.key === key)?.sampleVars ?? {};
}

/** Renders a subject/body pair with the template's sample variables (no database writes). */
export async function previewTemplate(key: string, subject: string, body: string): Promise<RenderedEmail> {
  const biz = await getSettings("business");
  const vars = { ...(await businessMergeVars()), ...sampleVarsFor(key) };
  return renderEmail({
    subject,
    body,
    vars,
    businessName: biz.name,
    footerLines: [biz.phone, biz.email],
    unsubscribeUrl: DEFAULT_TEMPLATES.find((t) => t.key === key)?.category === "MARKETING" ? "https://example.com/unsubscribe?token=sample" : null,
  });
}

export async function updateTemplate(actor: Actor, id: string, input: z.input<typeof templateSchema> | Record<string, unknown>) {
  assertCan(actor, PERM);
  const v = parseOrThrow(templateSchema, input);
  const t = await prisma.emailTemplate.update({ where: { id }, data: v });
  await audit({ actorUserId: actor.id, action: "email_template.update", entityType: "EmailTemplate", entityId: id, metadata: { key: t.key, isActive: t.isActive } });
  return t;
}

export async function resetTemplate(actor: Actor, id: string) {
  assertCan(actor, PERM);
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) throw new AdminError("That template no longer exists.");
  const def = DEFAULT_TEMPLATES.find((d) => d.key === t.key);
  if (!def) throw new AdminError("There is no built-in default for this template.");
  const updated = await prisma.emailTemplate.update({ where: { id }, data: { subject: def.subject, body: def.body, name: def.name, category: def.category } });
  await audit({ actorUserId: actor.id, action: "email_template.reset", entityType: "EmailTemplate", entityId: id, metadata: { key: t.key } });
  return updated;
}

export type TestSendResult = {
  queued: boolean;
  queueReason?: string;
  communicationId?: string;
  decision: { allowed: boolean; reason?: string };
  status?: string;
  statusReason?: string | null;
};

/**
 * Sends a test of a template to an address the admin typed, through the normal
 * queue (so delivery gates apply), then processes the job immediately.
 */
export async function sendTestEmail(actor: Actor, templateKey: string, to: string): Promise<TestSendResult> {
  assertCan(actor, PERM);
  const email = parseOrThrow(zEmail, to);
  const template = await prisma.emailTemplate.findUnique({ where: { key: templateKey } });
  if (!template && !DEFAULT_TEMPLATES.some((t) => t.key === templateKey)) throw new AdminError("Unknown template.");
  const decision = deliveryDecision(email);
  const result = await queueTemplatedEmail({
    templateKey,
    to: email,
    vars: sampleVarsFor(templateKey),
    idempotencyKey: `template-test:${templateKey}:${email}:${Date.now()}`,
    relatedType: "EmailTemplateTest",
    relatedId: template?.id,
    createdById: actor.id,
  });
  await audit({ actorUserId: actor.id, action: "email_template.test_send", entityType: "EmailTemplate", entityId: template?.id ?? templateKey, metadata: { key: templateKey, queued: result.queued } });

  if (result.queued && result.communicationId) await processTestJob(result.communicationId);
  const comm = result.communicationId ? await prisma.communication.findUnique({ where: { id: result.communicationId } }) : null;
  return {
    queued: result.queued,
    queueReason: result.reason,
    communicationId: result.communicationId,
    decision: decision.allowed ? { allowed: true } : { allowed: false, reason: decision.reason },
    status: comm?.status,
    statusReason: comm?.statusReason,
  };
}

/**
 * Runs the queued test email now. Uses runDueJobs when every due job type has a
 * registered handler in this process; otherwise (other job types are handled by
 * the worker) it delivers only this email, so unrelated jobs are not failed.
 */
async function processTestJob(communicationId: string) {
  const dueTypes = await prisma.job.findMany({ where: { status: { in: ["PENDING", "FAILED"] }, runAt: { lte: new Date() } }, distinct: ["type"], select: { type: true } });
  if (dueTypes.every((j) => hasHandler(j.type))) {
    await runDueJobs({ workerId: "admin-test-send", limit: 25 });
    return;
  }
  const job = await prisma.job.findFirst({ where: { type: "email.send", status: "PENDING", payload: { path: ["communicationId"], equals: communicationId } } });
  if (!job) return;
  try {
    await deliverQueuedEmail(job.payload as Record<string, unknown>);
    await prisma.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", attempts: { increment: 1 }, completedAt: new Date() } });
  } catch (err) {
    await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", attempts: { increment: 1 }, lastError: (err as Error).message.slice(0, 1000) } });
  }
}

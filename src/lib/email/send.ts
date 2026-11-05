import { prisma, type Tx } from "../db";
import { env } from "../env";
import { enqueueJob, registerJobHandler } from "../jobs/queue";
import { getSettings } from "../settings";
import { DEFAULT_TEMPLATES } from "./defaults";
import { deliveryDecision, getEmailProvider } from "./provider";
import { renderEmail, type MergeVars } from "./render";

/**
 * Queues a templated email. The email is recorded in Communication (status
 * QUEUED) and delivered by a background job. Re-queuing with the same
 * idempotencyKey is a no-op, so callers can safely retry.
 */
export async function queueTemplatedEmail(params: {
  templateKey: string;
  to: string | null | undefined;
  vars: MergeVars;
  idempotencyKey: string;
  customerId?: string | null;
  facilityId?: string | null;
  relatedType?: string;
  relatedId?: string;
  createdById?: string | null;
  tx?: Tx;
}): Promise<{ queued: boolean; communicationId?: string; reason?: string }> {
  const client = params.tx ?? prisma;
  const to = params.to?.trim().toLowerCase();
  if (!to) return { queued: false, reason: "No recipient email address." };

  const existing = await client.communication.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
  if (existing) return { queued: false, communicationId: existing.id, reason: "Already queued (idempotent)." };

  const template = await client.emailTemplate.findUnique({ where: { key: params.templateKey } });
  const category = template?.category ?? DEFAULT_TEMPLATES.find((t) => t.key === params.templateKey)?.category ?? "TRANSACTIONAL";

  // Marketing messages require recorded consent.
  if (category === "MARKETING") {
    const customer = params.customerId ? await client.customer.findUnique({ where: { id: params.customerId } }) : null;
    if (!customer?.marketingOptIn) {
      const comm = await client.communication.create({
        data: {
          channel: "EMAIL",
          customerId: params.customerId ?? null,
          toAddress: to,
          templateKey: params.templateKey,
          status: "SKIPPED",
          statusReason: "No marketing consent on file.",
          idempotencyKey: params.idempotencyKey,
          relatedType: params.relatedType,
          relatedId: params.relatedId,
        },
      });
      return { queued: false, communicationId: comm.id, reason: "No marketing consent." };
    }
  }

  let comm;
  try {
    comm = await client.communication.create({
    data: {
      channel: "EMAIL",
      customerId: params.customerId ?? null,
      facilityId: params.facilityId ?? null,
      toAddress: to,
      templateKey: params.templateKey,
      status: "QUEUED",
      idempotencyKey: params.idempotencyKey,
      relatedType: params.relatedType,
      relatedId: params.relatedId,
      createdById: params.createdById ?? null,
    },
  });
  } catch (err) {
    // A concurrent caller queued the same message first: treat as already queued.
    if ((err as { code?: string }).code === "P2002" && !params.tx) {
      const dup = await prisma.communication.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
      if (dup) return { queued: false, communicationId: dup.id, reason: "Already queued (idempotent)." };
    }
    throw err;
  }
  await enqueueJob(
    "email.send",
    { communicationId: comm.id, templateKey: params.templateKey, vars: params.vars },
    { idempotencyKey: `email:${params.idempotencyKey}`, tx: params.tx },
  );
  return { queued: true, communicationId: comm.id };
}

export async function businessMergeVars(): Promise<MergeVars> {
  const biz = await getSettings("business");
  return {
    businessName: biz.name,
    businessPhone: biz.phone,
    businessEmail: biz.email,
    phoneSentence: biz.phone ? ` or call us at ${biz.phone}` : "",
    bookingUrl: `${env.appUrl}/schedule`,
    portalUrl: `${env.appUrl}/portal`,
  };
}

export async function renderTemplateByKey(templateKey: string, vars: MergeVars, opts: { unsubscribeToken?: string | null } = {}) {
  const template = await prisma.emailTemplate.findUnique({ where: { key: templateKey } });
  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === templateKey);
  if (!template && !fallback) throw new Error(`Unknown email template: ${templateKey}`);
  if (template && !template.isActive) return null;
  const biz = await getSettings("business");
  const merged = { ...(await businessMergeVars()), ...vars };
  const category = template?.category ?? fallback!.category;
  return renderEmail({
    subject: template?.subject ?? fallback!.subject,
    body: template?.body ?? fallback!.body,
    vars: merged,
    businessName: biz.name,
    footerLines: [biz.phone, biz.email, biz.showAddressPublicly ? [biz.addressLine, biz.city, biz.state].filter(Boolean).join(", ") : ""],
    unsubscribeUrl: category === "MARKETING" && opts.unsubscribeToken ? `${env.appUrl}/unsubscribe?token=${opts.unsubscribeToken}` : null,
  });
}

/** Job handler: renders and delivers (or records why it was skipped). */
export async function deliverQueuedEmail(payload: Record<string, unknown>) {
  const communicationId = String(payload.communicationId);
  const comm = await prisma.communication.findUnique({ where: { id: communicationId }, include: { customer: true } });
  if (!comm) return;
  if (comm.status === "SENT" || comm.status === "SKIPPED") return; // idempotent

  const rendered = await renderTemplateByKey(String(payload.templateKey), (payload.vars ?? {}) as MergeVars, {
    unsubscribeToken: comm.customer?.unsubscribeToken,
  });
  if (!rendered) {
    await prisma.communication.update({ where: { id: comm.id }, data: { status: "SKIPPED", statusReason: "Template is inactive." } });
    return;
  }
  const preview = rendered.text.slice(0, 2000);
  const decision = deliveryDecision(comm.toAddress ?? "");
  if (!decision.allowed) {
    await prisma.communication.update({
      where: { id: comm.id },
      data: { status: "SKIPPED", statusReason: decision.reason, subject: rendered.subject, bodyPreview: preview },
    });
    return;
  }
  const provider = getEmailProvider()!;
  try {
    const result = await provider.send({
      to: comm.toAddress!,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: comm.idempotencyKey ?? comm.id,
      headers: comm.customer?.unsubscribeToken
        ? { "List-Unsubscribe": `<${env.appUrl}/unsubscribe?token=${comm.customer.unsubscribeToken}>` }
        : undefined,
    });
    await prisma.communication.update({
      where: { id: comm.id },
      data: { status: "SENT", provider: provider.name, providerMessageId: result.id, sentAt: new Date(), subject: rendered.subject, bodyPreview: preview, statusReason: null },
    });
  } catch (err) {
    await prisma.communication.update({
      where: { id: comm.id },
      data: { status: "FAILED", statusReason: (err as Error).message.slice(0, 500), subject: rendered.subject, bodyPreview: preview },
    });
    throw err; // let the job retry
  }
}

registerJobHandler("email.send", deliverQueuedEmail);

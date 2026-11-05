"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { fd, failure, formObject, success, type ActionState } from "@/lib/forms";
import { toActionState, type Actor } from "@/lib/admin/common";
import { previewTemplate, resetTemplate, sendTestEmail, updateTemplate } from "@/lib/admin/templates";

async function actor(): Promise<Actor> {
  const u = await requirePermission("templates:manage", "/admin/email-templates");
  return { id: u.id, role: u.role };
}

export async function saveTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id");
  const form = formObject(formData);
  // Keep the body's internal whitespace/newlines exactly as typed.
  const body = String(formData.get("body") ?? "");
  const res = await toActionState(async () => {
    await updateTemplate(a, id, { ...form, body });
    return "Template saved.";
  });
  if (res.ok) {
    revalidatePath("/admin/email-templates");
    revalidatePath(`/admin/email-templates/${id}`);
  }
  return res;
}

export async function resetTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id");
  const res = await toActionState(async () => {
    await resetTemplate(a, id);
    return "Template reset to the built-in default.";
  });
  if (res.ok) {
    revalidatePath("/admin/email-templates");
    revalidatePath(`/admin/email-templates/${id}`);
  }
  return res;
}

export async function previewTemplateAction(key: string, subject: string, body: string) {
  await actor();
  const r = await previewTemplate(String(key).slice(0, 100), String(subject).slice(0, 500), String(body).slice(0, 20_000));
  return { subject: r.subject, html: r.html, text: r.text, missing: r.missing };
}

export async function sendTestEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const key = fd(formData, "key");
  const to = fd(formData, "to");
  const res = await toActionState(async () => {
    const r = await sendTestEmail(a, key, to);
    const details: string[] = [];
    details.push(r.queued ? "Queued: yes — recorded in the communication log." : `Queued: no — ${r.queueReason ?? "not queued"}`);
    details.push(r.decision.allowed ? "Delivery check: allowed (email is configured and this recipient is permitted)." : `Delivery check: skipped — ${r.decision.reason}`);
    if (r.status) details.push(`Result after processing: ${r.status}${r.statusReason ? ` — ${r.statusReason}` : ""}`);
    if (r.communicationId) details.push(`Communication ID: ${r.communicationId}`);
    const headline =
      r.status === "SENT"
        ? `Test email sent to ${to}.`
        : r.status === "SKIPPED"
          ? `Test email was recorded but not delivered to ${to}. Delivery is skipped unless email is configured and EMAIL_DELIVERY_MODE allows the recipient.`
          : r.status === "FAILED"
            ? `Sending to ${to} failed. See details below.`
            : `Test email queued for ${to}.`;
    return r.status === "FAILED" ? { ...failure(headline), data: { details } } : success(headline, { details });
  });
  revalidatePath("/admin/communications");
  return res;
}

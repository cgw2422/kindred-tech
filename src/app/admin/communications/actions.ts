"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { fd, formObject, type ActionState } from "@/lib/forms";
import { toActionState, type Actor } from "@/lib/admin/common";
import { logCommunication, retryJob, runJobsNow, searchCustomers } from "@/lib/admin/communications";

async function actor(perm: "communications:view" | "settings:manage" = "communications:view"): Promise<Actor> {
  const u = await requirePermission(perm, "/admin/communications");
  return { id: u.id, role: u.role };
}

export async function searchCustomersAction(q: string) {
  await actor();
  return searchCustomers(String(q ?? ""));
}

export async function logCommunicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const form = formObject(formData);
  const res = await toActionState(async () => {
    await logCommunication(a, { ...form, body: String(formData.get("body") ?? "") });
    return form.channel === "NOTE" ? "Note saved." : "Phone call logged.";
  });
  if (res.ok) revalidatePath("/admin/communications");
  return res;
}

export async function retryJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor("settings:manage");
  const res = await toActionState(async () => {
    await retryJob(a, fd(formData, "id"));
    return "Queued to run again.";
  });
  if (res.ok) revalidatePath("/admin/communications/jobs");
  return res;
}

export async function runJobsNowAction(_prev: ActionState): Promise<ActionState> {
  const a = await actor("settings:manage");
  const res = await toActionState(async () => {
    const r = await runJobsNow(a);
    return r.processed === 0 ? "No jobs were due." : `Processed ${r.processed} job(s); ${r.failed} failed.`;
  });
  revalidatePath("/admin/communications/jobs");
  revalidatePath("/admin/communications");
  return res;
}

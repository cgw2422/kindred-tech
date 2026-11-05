"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { fd, failure, formObject, success, type ActionState } from "@/lib/forms";
import { toActionState, type Actor } from "@/lib/admin/common";
import { saveSettingsSection, settingsFromForm } from "@/lib/admin/settings";
import { conflictLines, createBlackout, deleteBlackout } from "@/lib/admin/technicians";
import { getSettings, settingsSchemas, type SettingsKey } from "@/lib/settings";

async function actor(): Promise<Actor> {
  const u = await requirePermission("settings:manage", "/admin/settings");
  return { id: u.id, role: u.role };
}

const SECTION_NAMES: Record<SettingsKey, string> = {
  business: "Business information",
  hours: "Business hours",
  booking: "Booking rules",
  cancellation: "Cancellation policy",
  billing: "Billing",
  notifications: "Notifications",
  privacy: "Privacy and data retention",
};

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const key = fd(formData, "section") as SettingsKey;
  if (!(key in settingsSchemas)) return failure("Unknown settings section.");
  const res = await toActionState(async () => {
    await saveSettingsSection(a, key, settingsFromForm(key, formObject(formData)));
    return `${SECTION_NAMES[key]} saved.`;
  });
  if (res.ok) {
    revalidatePath("/admin/settings");
    // Business name, hours and policies appear on public pages too.
    revalidatePath("/", "layout");
  }
  return res;
}

export async function createClosureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  let warnings: string[] = [];
  let count = 0;
  const res = await toActionState(async () => {
    const { conflicts } = await createBlackout(a, { ...formObject(formData), technicianId: null });
    count = conflicts.length;
    warnings = conflictLines(conflicts, (await getSettings("business")).timeZone);
    return count
      ? `Closure saved. ${count} active appointment(s) fall during it and were NOT moved — please contact those customers and reschedule.`
      : "Closure saved. No appointments are affected.";
  });
  if (!res.ok) return res;
  revalidatePath("/admin/settings/closures");
  return warnings.length ? success(res.message, { warnings }) : res;
}

export async function deleteClosureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const res = await toActionState(async () => {
    await deleteBlackout(a, fd(formData, "id"));
    return "Closure removed.";
  });
  if (res.ok) revalidatePath("/admin/settings/closures");
  return res;
}

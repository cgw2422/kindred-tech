"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { fd, formObject, success, type ActionState } from "@/lib/forms";
import { toActionState, type Actor } from "@/lib/admin/common";
import { createBlackout, createTechnicianWithUser, deleteBlackout, parseScheduleForm, saveWeeklySchedule, updateTechnician, conflictLines } from "@/lib/admin/technicians";
import { getSettings } from "@/lib/settings";

async function actor(): Promise<Actor> {
  const u = await requirePermission("technicians:manage", "/admin/technicians");
  return { id: u.id, role: u.role };
}

export async function createTechnicianAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  let id: string | null = null;
  const res = await toActionState(async () => {
    id = (await createTechnicianWithUser(a, formObject(formData))).id;
    return "Technician added.";
  });
  if (res.ok && id) {
    revalidatePath("/admin/technicians");
    redirect(`/admin/technicians/${id}?created=1`);
  }
  return res;
}

export async function updateTechnicianAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id");
  const res = await toActionState(async () => {
    await updateTechnician(a, id, formObject(formData));
    return "Technician details saved.";
  });
  if (res.ok) {
    revalidatePath("/admin/technicians");
    revalidatePath(`/admin/technicians/${id}`);
  }
  return res;
}

export async function saveScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id");
  const res = await toActionState(async () => {
    await saveWeeklySchedule(a, id, parseScheduleForm(formObject(formData)));
    return "Weekly schedule saved.";
  });
  if (res.ok) revalidatePath(`/admin/technicians/${id}`);
  return res;
}

export async function createTimeOffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "technicianId");
  let warnings: string[] = [];
  const res = await toActionState(async () => {
    const { conflicts } = await createBlackout(a, { ...formObject(formData), technicianId: id });
    warnings = conflictLines(conflicts, (await getSettings("business")).timeZone);
    return conflicts.length
      ? `Time off saved. ${conflicts.length} active appointment(s) overlap it and were NOT moved — please reschedule or reassign them.`
      : "Time off saved. No appointments are affected.";
  });
  if (res.ok) {
    revalidatePath(`/admin/technicians/${id}`);
    return warnings.length ? success(res.message, { warnings }) : res;
  }
  return res;
}

export async function deleteTimeOffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const res = await toActionState(async () => {
    await deleteBlackout(a, fd(formData, "id"));
    return "Removed.";
  });
  if (res.ok) revalidatePath(`/admin/technicians/${fd(formData, "technicianId")}`);
  return res;
}

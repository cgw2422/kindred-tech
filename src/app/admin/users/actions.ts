"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { fd, formObject, type ActionState } from "@/lib/forms";
import { toActionState, type Actor } from "@/lib/admin/common";
import { changeUserRole, createStaffUser, forceSignOut, setUserActive } from "@/lib/admin/users";

async function actor(): Promise<Actor> {
  const u = await requirePermission("users:manage", "/admin/users");
  return { id: u.id, role: u.role };
}

function done(res: ActionState) {
  if (res.ok) {
    revalidatePath("/admin/users");
    revalidatePath("/admin/technicians");
  }
  return res;
}

export async function createStaffUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => {
      const u = await createStaffUser(a, formObject(formData));
      return `${u.name} was added. They can sign in using the email link at /login with ${u.email}.`;
    }),
  );
}

export async function changeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => {
      await changeUserRole(a, fd(formData, "id"), fd(formData, "role"));
      return "Role updated.";
    }),
  );
}

export async function setActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const active = fd(formData, "active") === "true";
  return done(
    await toActionState(async () => {
      await setUserActive(a, fd(formData, "id"), active);
      return active ? "Account activated." : "Account deactivated and signed out.";
    }),
  );
}

export async function forceSignOutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => {
      const n = await forceSignOut(a, fd(formData, "id"));
      return n ? `Signed out of ${n} session(s).` : "No active sessions.";
    }),
  );
}

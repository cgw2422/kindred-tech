import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { zEmail, zPhone } from "@/lib/forms";
import { AdminError, assertCan, parseOrThrow, zText, type Actor } from "./common";

const PERM = "users:manage" as const;
export const STAFF_ROLES = ["OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN"] as const satisfies readonly Role[];
export type StaffRole = (typeof STAFF_ROLES)[number];

const staffUserSchema = z.object({
  name: zText("Full name", 120),
  email: zEmail,
  phone: zPhone.optional().transform((v) => (v ? v : null)),
  role: z.enum(STAFF_ROLES, { error: "Please choose a role." }),
});

export type StaffUserInput = z.input<typeof staffUserSchema>;

/** Creates a staff user without a password (they sign in with an email link). TECHNICIANs also get a Technician row. */
export async function createStaffUser(actor: Actor, input: StaffUserInput | Record<string, unknown>) {
  assertCan(actor, PERM);
  const v = parseOrThrow(staffUserSchema, input);
  if (await prisma.user.findUnique({ where: { email: v.email } })) {
    throw new AdminError("A user with that email address already exists.", { email: "A user with that email address already exists." });
  }
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: v.email, name: v.name, phone: v.phone, role: v.role, isActive: true } });
    if (v.role === "TECHNICIAN") await tx.technician.create({ data: { userId: u.id, displayName: v.name } });
    return u;
  });
  await audit({ actorUserId: actor.id, action: "user.create", entityType: "User", entityId: user.id, metadata: { role: user.role } });
  return user;
}

async function activeOwnerCount(tx: Pick<typeof prisma, "user"> = prisma) {
  return tx.user.count({ where: { role: "OWNER", isActive: true } });
}

export async function changeUserRole(actor: Actor, userId: string, role: string) {
  assertCan(actor, PERM);
  const newRole = parseOrThrow(z.enum(STAFF_ROLES, { error: "Please choose a staff role." }), role);
  if (userId === actor.id) throw new AdminError("You cannot change your own role. Ask another owner to do it.");
  await prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, include: { technician: true } });
      if (!target) throw new AdminError("That user no longer exists.");
      if (!(STAFF_ROLES as readonly Role[]).includes(target.role)) throw new AdminError("Customer and facility contact accounts cannot be given staff roles here.");
      if (target.role === newRole) return;
      if (target.role === "OWNER" && target.isActive && (await activeOwnerCount(tx)) <= 1) {
        throw new AdminError("This is the last active owner. Make someone else an owner first.");
      }
      await tx.user.update({ where: { id: userId }, data: { role: newRole } });
      if (newRole === "TECHNICIAN" && !target.technician) await tx.technician.create({ data: { userId, displayName: target.name } });
    },
    { isolationLevel: "Serializable" },
  );
  await audit({ actorUserId: actor.id, action: "user.role_change", entityType: "User", entityId: userId, metadata: { role: newRole } });
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  assertCan(actor, PERM);
  if (userId === actor.id) throw new AdminError("You cannot deactivate your own account.");
  await prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new AdminError("That user no longer exists.");
      if (!active && target.role === "OWNER" && target.isActive && (await activeOwnerCount(tx)) <= 1) {
        throw new AdminError("This is the last active owner and cannot be deactivated.");
      }
      await tx.user.update({ where: { id: userId }, data: { isActive: active } });
      if (!active) await tx.session.deleteMany({ where: { userId } });
    },
    { isolationLevel: "Serializable" },
  );
  await audit({ actorUserId: actor.id, action: active ? "user.activate" : "user.deactivate", entityType: "User", entityId: userId });
}

export async function forceSignOut(actor: Actor, userId: string) {
  assertCan(actor, PERM);
  if (userId === actor.id) throw new AdminError("Use \"Sign out\" to end your own session.");
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  await audit({ actorUserId: actor.id, action: "user.force_sign_out", entityType: "User", entityId: userId, metadata: { sessions: count } });
  return count;
}

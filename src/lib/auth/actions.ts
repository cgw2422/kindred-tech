"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../codes";
import { audit } from "../audit";
import { rateLimit, rateLimitCount, recordRateLimitHit } from "../rate-limit";
import { queueTemplatedEmail } from "../email/send";
import { deliveryDecision } from "../email/provider";
import { failure, fd, success, type ActionState } from "../forms";
import { hashPassword, passwordProblems, verifyPassword } from "./password";
import { clientIp, createSession, destroySession, getSessionUser, revokeOtherSessions } from "./session";
import { homePathForRole } from "./permissions";

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = fd(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(fd(formData, "next"));
  if (!email || !password) return failure("Please enter your email and password.");

  const ip = (await clientIp()) ?? "unknown";
  // Per-IP limit counts all attempts; per-account limit counts only failures.
  if (!(await rateLimit(`login:ip:${ip}`, 60, 15 * 60)) || (await rateLimitCount(`login:fail:${email}`, 15 * 60)) >= 10) {
    return failure("Too many sign-in attempts. Please wait 15 minutes and try again.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return failure("This account is temporarily locked after several unsuccessful attempts. Please try again later or reset your password.");
  }
  const ok = user && user.isActive && (await verifyPassword(password, user.passwordHash));
  if (!user || !ok) {
    if (user) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      await audit({ actorUserId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id, ip });
    }
    await recordRateLimitHit(`login:fail:${email}`);
    return failure("That email and password combination did not match our records.");
  }
  await createSession(user.id, user.role);
  await audit({ actorUserId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip });
  redirect(next ?? homePathForRole(user.role));
}

export async function logoutAction() {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit({ actorUserId: user.id, action: "auth.logout", entityType: "User", entityId: user.id });
  redirect("/login?signedOut=1");
}

/**
 * Sends a one-time sign-in link (customers, family members, facility contacts)
 * or a password reset link. Always responds identically to avoid revealing
 * which emails have accounts.
 */
export async function requestEmailLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(fd(formData, "email"));
  const purpose = fd(formData, "purpose") === "reset" ? "reset" : "signin";
  if (!parsed.success) return failure("Please enter a valid email address.");
  const email = parsed.data;
  const ip = (await clientIp()) ?? "unknown";
  if (!(await rateLimit(`emaillink:ip:${ip}`, 10, 15 * 60)) || !(await rateLimit(`emaillink:email:${email}`, 3, 15 * 60))) {
    return failure("Too many requests. Please wait a few minutes and try again.");
  }
  const generic = success("If that email is in our records, we have sent a link. Please check your inbox (and spam folder). The link expires in 1 hour.");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user && purpose === "signin") {
    // Customers who have booked with us can activate a portal account just by email.
    const customer = await prisma.customer.findFirst({ where: { email: { equals: email, mode: "insensitive" }, user: null }, orderBy: { createdAt: "asc" } });
    const family = customer ? null : await prisma.familyContact.findFirst({ where: { email: { equals: email, mode: "insensitive" }, userId: null } });
    if (customer) {
      user = await prisma.user.create({ data: { email, name: `${customer.firstName} ${customer.lastName}`.trim(), role: "CUSTOMER", customerId: customer.id } });
    } else if (family) {
      user = await prisma.user.create({ data: { email, name: family.name, role: "CUSTOMER" } });
      await prisma.familyContact.updateMany({ where: { email: { equals: email, mode: "insensitive" }, userId: null }, data: { userId: user.id } });
    }
  }
  if (!user || !user.isActive) return generic;

  const token = randomToken(32);
  await prisma.authToken.create({
    data: { tokenHash: sha256(token), type: purpose === "reset" ? "PASSWORD_RESET" : "MAGIC_LINK", userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  const url = `${env.appUrl}/auth/verify?token=${token}${purpose === "reset" ? "&reset=1" : ""}`;
  await queueTemplatedEmail({
    templateKey: "password_reset",
    to: email,
    vars: {
      customerName: user.name.split(" ")[0],
      actionText: purpose === "reset" ? "choose a new password" : "sign in to your account",
      buttonLabel: purpose === "reset" ? "Choose a new password" : "Sign in",
      actionUrl: url,
      expiresIn: "1 hour",
    },
    idempotencyKey: `authlink:${sha256(token)}`,
    customerId: user.customerId,
    relatedType: "User",
    relatedId: user.id,
  });
  await audit({ actorUserId: user.id, action: purpose === "reset" ? "auth.reset_requested" : "auth.magic_link_requested", entityType: "User", entityId: user.id, ip });

  // Development convenience only: when email cannot be delivered, show the link locally.
  if (!env.isProduction && !deliveryDecision(email).allowed) {
    return { ...generic, data: { devLink: url } };
  }
  return generic;
}

export async function consumeEmailToken(token: string): Promise<{ userId: string; type: string } | null> {
  if (!token) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) return null;
  const res = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (res.count === 0) return null;
  await prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: row.user.emailVerifiedAt ?? new Date() } });
  return { userId: row.userId, type: row.type };
}

export async function setPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return failure("Your session has expired. Please request a new link.");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const current = String(formData.get("current") ?? "");
  const problem = passwordProblems(password);
  if (problem) return failure(problem, { password: problem });
  if (password !== confirm) return failure("The two passwords do not match.", { confirm: "Passwords do not match." });
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const viaReset = fd(formData, "viaReset") === "1";
  if (full.passwordHash && !viaReset && !(await verifyPassword(current, full.passwordHash))) {
    return failure("Your current password is not correct.", { current: "Incorrect password." });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } });
  // Sign out other sessions after a password change.
  await revokeOtherSessions(user.id);
  await audit({ actorUserId: user.id, action: "auth.password_changed", entityType: "User", entityId: user.id });
  return success("Your password has been saved.");
}

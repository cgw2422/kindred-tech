import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";
import { prisma } from "../db";
import { randomToken, sha256 } from "../codes";
import { can, type Permission } from "./permissions";

export const SESSION_COOKIE = "kts_session";
const CUSTOMER_SESSION_DAYS = 14;
const STAFF_SESSION_HOURS = 12;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "customerId">;

export async function createSession(userId: string, role: Role) {
  const token = randomToken(32);
  const ttlMs = role === "CUSTOMER" ? CUSTOMER_SESSION_DAYS * 86400_000 : STAFF_SESSION_HOURS * 3600_000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const h = await headers();
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 250) ?? null },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, customerId: true, isActive: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const { id, email, name, role, customerId } = session.user;
  return { id, email, name, role, customerId };
}

/** Use in pages and server actions. Redirects to login when signed out; to /forbidden when not permitted. */
export async function requirePermission(permission: Permission, nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  if (!can(user.role, permission)) redirect("/forbidden");
  return user;
}

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return user;
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Non-redirecting variant for route handlers. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !can(user.role, permission)) throw new AuthorizationError();
  return user;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/** Revokes every session for the user except the one making this request. */
export async function revokeOtherSessions(userId: string) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await prisma.session.deleteMany({ where: { userId, ...(token ? { tokenHash: { not: sha256(token) } } : {}) } });
}

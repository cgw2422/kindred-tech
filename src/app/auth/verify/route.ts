import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { consumeEmailToken } from "@/lib/auth/actions";
import { createSession } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const result = await consumeEmailToken(token);
  if (!result) return NextResponse.redirect(new URL("/login?linkExpired=1", env.appUrl));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
  await createSession(user.id, user.role);
  await audit({ actorUserId: user.id, action: "auth.email_link_login", entityType: "User", entityId: user.id });
  const dest = result.type === "PASSWORD_RESET" ? "/account/password?reset=1" : homePathForRole(user.role);
  return NextResponse.redirect(new URL(dest, env.appUrl));
}

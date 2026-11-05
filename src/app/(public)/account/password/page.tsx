import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { SetPasswordForm } from "./SetPasswordForm";

export const metadata: Metadata = { title: "Password", robots: { index: false } };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/account/password");
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  const viaReset = sp.reset === "1";
  return (
    <div className="container-site max-w-xl py-12">
      <h1 className="mb-2 text-3xl">{full.passwordHash && !viaReset ? "Change your password" : "Choose a password"}</h1>
      <p className="mb-6 text-lg">A password is optional for customers. You can always sign in with an emailed link instead.</p>
      <Card>
        <SetPasswordForm needsCurrent={Boolean(full.passwordHash) && !viaReset} viaReset={viaReset} />
      </Card>
    </div>
  );
}

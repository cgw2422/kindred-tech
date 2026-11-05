import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/permissions";
import { EmailLinkForm, PasswordLoginForm } from "./LoginForms";

export const metadata: Metadata = { title: "Sign In", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(homePathForRole(user.role));
  return (
    <div className="container-site py-12">
      <h1 className="mb-2 text-3xl md:text-4xl">Sign in</h1>
      <p className="mb-8 max-w-2xl text-lg">
        Customers and family members can view appointments, pay invoices, and manage preferences. You do not need an account to schedule a visit.
      </p>
      <div className="mb-6 max-w-2xl space-y-3">
        {sp.signedOut && <Notice tone="green">You have been signed out.</Notice>}
        {sp.linkExpired && <Notice tone="warn">That sign-in link has expired or was already used. Please request a new one.</Notice>}
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-xl">Sign in with an email link</h2>
          <p className="mb-4">The simplest option. We email you a secure link; no password needed.</p>
          <EmailLinkForm />
        </Card>
        <Card>
          <h2 className="mb-1 text-xl">Sign in with a password</h2>
          <p className="mb-4">For staff and anyone who has set a password.</p>
          <PasswordLoginForm next={sp.next} />
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, requestEmailLinkAction } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";

export function PasswordLoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <TextInput id="password-email" label="Email address" name="email" type="email" autoComplete="email" required />
      <TextInput id="password-password" label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pendingText="Signing in..." className="w-full" size="lg">
        Sign In
      </SubmitButton>
      <p className="mt-4 text-center">
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
    </form>
  );
}

export function EmailLinkForm({ purpose = "signin" }: { purpose?: "signin" | "reset" }) {
  const [state, action] = useActionState(requestEmailLinkAction, initialActionState);
  const devLink = state.data?.devLink as string | undefined;
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      {devLink && (
        <div className="mb-4 rounded-md border border-warn/40 bg-warn-light p-3 text-sm text-warn">
          <p className="font-bold">Development mode: email delivery is not configured.</p>
          <p className="break-all">
            <a href={devLink}>Open the sign-in link</a>
          </p>
        </div>
      )}
      <input type="hidden" name="purpose" value={purpose} />
      <TextInput
        id={`${purpose}-link-email`}
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint={purpose === "signin" ? "Use the email address you gave us when booking." : undefined}
      />
      <SubmitButton pendingText="Sending..." variant="secondary" className="w-full" size="lg">
        {purpose === "reset" ? "Email me a reset link" : "Email me a sign-in link"}
      </SubmitButton>
    </form>
  );
}

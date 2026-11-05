"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { initialActionState } from "@/lib/forms";
import { confirmUnsubscribe } from "./actions";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmUnsubscribe, initialActionState);
  if (state.ok) {
    return (
      <div role="status" className="rounded-lg border border-green/40 bg-green-light p-6">
        <p className="font-heading text-xl font-bold text-navy">{state.message}</p>
        <p className="mt-2 text-navy-dark">
          You will no longer receive marketing emails from us. You will still receive messages about your appointments, invoices, and account.
        </p>
      </div>
    );
  }
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Updating..." size="lg">
        Unsubscribe From Marketing Emails
      </SubmitButton>
    </form>
  );
}

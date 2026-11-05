"use client";

import { useActionState } from "react";
import { setPasswordAction } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";

export function SetPasswordForm({ needsCurrent, viaReset }: { needsCurrent: boolean; viaReset: boolean }) {
  const [state, action] = useActionState(setPasswordAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="viaReset" value={viaReset ? "1" : "0"} />
      {needsCurrent && <TextInput label="Current password" name="current" type="password" autoComplete="current-password" required error={state.fieldErrors?.current} />}
      <TextInput label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters. A short phrase is easy to remember." error={state.fieldErrors?.password} />
      <TextInput label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <SubmitButton size="lg">Save password</SubmitButton>
    </form>
  );
}

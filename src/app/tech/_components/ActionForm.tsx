"use client";

import { useActionState, type ReactNode } from "react";
import { FormMessage } from "@/components/forms";
import { initialActionState, type ActionState } from "@/lib/forms";

/** A form bound to a server action with inline success/error messages. */
export function ActionForm({
  action,
  children,
  className = "",
  ariaLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className={className} aria-label={ariaLabel}>
      <FormMessage state={state} />
      {children}
    </form>
  );
}

"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { FormMessage } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { initialActionState, type ActionState } from "@/lib/forms";

/** Small form wrapper for portal actions; keeps typed values when there is an error. */
export function PortalForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Sending...",
  resetOnSuccess = false,
  className = "",
  size = "md",
  variant = "primary",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "outline";
}) {
  const [state, dispatch, pending] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }
  return (
    <form ref={ref} onSubmit={onSubmit} aria-busy={pending} className={className}>
      <FormMessage state={state} />
      <fieldset disabled={pending} className="min-w-0">
        {children}
        <button type="submit" className={buttonClass(variant, size)}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </fieldset>
    </form>
  );
}

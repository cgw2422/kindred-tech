"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { FormMessage } from "@/components/forms";
import { initialActionState, type ActionState } from "@/lib/forms";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Generic admin form: server-rendered fields as children, a server action, and
 * useActionState for the result. Submits via a transition (not the form
 * `action` prop) so typed values are kept when validation fails. Fields are
 * disabled while saving.
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  inline = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  inline?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  }

  const fieldErrors = state.fieldErrors ? Object.values(state.fieldErrors) : [];
  const extraErrors = fieldErrors.filter((m) => m !== state.error);
  const warnings = (state.data?.warnings as string[] | undefined) ?? [];
  const details = (state.data?.details as string[] | undefined) ?? [];

  return (
    <form ref={ref} onSubmit={onSubmit} noValidate className={className} aria-busy={pending}>
      {!inline && <FormMessage state={state} />}
      {!inline && extraErrors.length > 0 && (
        <ul className="-mt-2 mb-4 list-disc pl-6 text-sm font-semibold text-danger">
          {extraErrors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {!inline && details.length > 0 && (
        <ul className="-mt-2 mb-4 list-disc pl-6 text-sm">
          {details.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {!inline && warnings.length > 0 && (
        <div role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-light p-3 text-warn">
          <p className="font-bold">Please review:</p>
          <ul className="list-disc pl-6">
            {warnings.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset disabled={pending} className={inline ? "contents" : "min-w-0"}>
        {children}
      </fieldset>
      {inline && state.error && (
        <span role="alert" className="ml-2 text-sm font-semibold text-danger">
          {state.error}
        </span>
      )}
      {inline && state.ok && state.message && (
        <span role="status" className="ml-2 text-sm font-semibold text-green-dark">
          {state.message}
        </span>
      )}
      {pending && <span className="sr-only">Saving…</span>}
    </form>
  );
}

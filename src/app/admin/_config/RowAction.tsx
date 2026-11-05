import type { ActionState } from "@/lib/forms";
import { SubmitButton } from "@/components/forms";
import { ActionForm } from "./ActionForm";

/** A one-button form (delete, retry, deactivate...) posting a record id. */
export function RowAction({
  action,
  id,
  label,
  confirm,
  variant = "outline",
  extra,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  id: string;
  label: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  extra?: Record<string, string>;
}) {
  return (
    <ActionForm action={action} inline className="inline-flex flex-wrap items-center">
      <input type="hidden" name="id" value={id} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton size="sm" variant={variant} confirm={confirm} pendingText="Working...">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

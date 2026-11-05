"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { initialActionState } from "@/lib/forms";
import { createInvoiceFromWorkOrderAction } from "../actions";

export function CreateInvoiceForm({ workOrderId }: { workOrderId: string }) {
  const [state, action] = useActionState(createInvoiceFromWorkOrderAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <SubmitButton pendingText="Creating invoice...">Create invoice</SubmitButton>
    </form>
  );
}

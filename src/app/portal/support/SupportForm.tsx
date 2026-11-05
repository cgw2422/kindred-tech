"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Select, TextArea, TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";
import { supportRequestAction } from "../actions";

export function SupportForm({ people }: { people: { id: string; name: string }[] }) {
  const [state, action] = useActionState(supportRequestAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      {people.length > 1 && <Select label="Who is this for?" name="customerId" options={people.map((p) => ({ value: p.id, label: p.name }))} required />}
      {people.length === 1 && <input type="hidden" name="customerId" value={people[0].id} />}
      <TextInput label="Subject" name="subject" required maxLength={150} />
      <TextArea label="How can we help?" name="message" required rows={6} hint="Please do not include passwords, account numbers, or medical information." />
      <SubmitButton size="lg">Send request</SubmitButton>
    </form>
  );
}

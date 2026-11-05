"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Checkbox, Select, TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";
import { updateProfileAction } from "../actions";

type P = { firstName: string; lastName: string; preferredName: string; phone: string; bestTimeToContact: string; contactPreference: string; marketingOptIn: boolean };

export function ProfileForm({ customer }: { customer: P }) {
  const [state, action] = useActionState(updateProfileAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <div className="grid gap-x-4 md:grid-cols-2">
        <TextInput label="First name" name="firstName" defaultValue={customer.firstName} required autoComplete="given-name" />
        <TextInput label="Last name" name="lastName" defaultValue={customer.lastName} required autoComplete="family-name" />
        <TextInput label="Preferred name" name="preferredName" defaultValue={customer.preferredName} />
        <TextInput label="Phone" name="phone" type="tel" defaultValue={customer.phone} autoComplete="tel" />
        <TextInput label="Best time to reach you" name="bestTimeToContact" defaultValue={customer.bestTimeToContact} />
        <Select
          label="How should we contact you?"
          name="contactPreference"
          defaultValue={customer.contactPreference}
          required
          options={[
            { value: "PHONE", label: "Phone call" },
            { value: "EMAIL", label: "Email" },
            { value: "TEXT", label: "Text message" },
            { value: "MAIL", label: "Mail" },
          ]}
        />
      </div>
      <Checkbox name="marketingOptIn" label="Send me occasional tips and news by email" hint="Appointment confirmations and invoices are always sent." defaultChecked={customer.marketingOptIn} />
      <SubmitButton size="lg">Save my details</SubmitButton>
    </form>
  );
}

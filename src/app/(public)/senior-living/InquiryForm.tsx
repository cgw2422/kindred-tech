"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Select, TextArea, TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";
import { submitFacilityInquiry } from "./actions";
import { FACILITY_INTERESTS } from "./schema";

export function InquiryForm() {
  const [state, action] = useActionState(submitFacilityInquiry, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = (state.data?.values ?? {}) as Record<string, string>;

  if (state.ok) {
    return (
      <div role="status" className="rounded-lg border border-green/40 bg-green-light p-6">
        <p className="font-heading text-xl font-bold text-navy">Thank you for reaching out</p>
        <p className="mt-2 text-navy-dark">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate aria-describedby="inquiry-required-note">
      <FormMessage state={state} />
      <p id="inquiry-required-note" className="mb-4 text-sm">
        Fields marked with <span className="text-danger">*</span> are required.
      </p>
      <div className="grid gap-x-5 md:grid-cols-2">
        <TextInput label="Community name" name="facilityName" defaultValue={v.facilityName} required autoComplete="organization" error={e.facilityName} />
        <TextInput label="City" name="city" defaultValue={v.city} autoComplete="address-level2" error={e.city} />
        <TextInput label="Your name" name="contactName" defaultValue={v.contactName} required autoComplete="name" error={e.contactName} />
        <TextInput label="Your title" name="contactTitle" defaultValue={v.contactTitle} autoComplete="organization-title" hint="For example, Activities Director" error={e.contactTitle} />
        <TextInput label="Email" name="email" defaultValue={v.email} type="email" required autoComplete="email" error={e.email} />
        <TextInput label="Phone" name="phone" defaultValue={v.phone} type="tel" autoComplete="tel" error={e.phone} />
        <TextInput label="Approximate number of residents" name="residentCount" defaultValue={v.residentCount} inputMode="numeric" error={e.residentCount} />
        <Select
          label="Which option interests you?"
          name="interest"
          defaultValue={v.interest ?? ""}
          placeholder="Choose an option"
          options={FACILITY_INTERESTS.map((i) => ({ value: i.value, label: i.label }))}
          error={e.interest}
        />
      </div>
      <TextArea label="Anything else we should know?" name="message" defaultValue={v.message} rows={5} hint="Resident needs, preferred days, or questions for us." error={e.message} />
      {/* Honeypot field for spam bots: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pendingText="Sending..." size="lg">
        Send Inquiry
      </SubmitButton>
    </form>
  );
}

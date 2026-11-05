"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Select, TextArea, TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";
import { COMMUNITY_TYPES, VISIT_FREQUENCIES } from "@/lib/community";
import { submitFacilityInquiry } from "./actions";
import { FACILITY_INTERESTS } from "./schema";

const legendClass = "mb-3 font-heading text-lg font-bold text-navy";

export function InquiryForm() {
  const [state, action] = useActionState(submitFacilityInquiry, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = (state.data?.values ?? {}) as Record<string, string>;

  if (state.ok) {
    return (
      <div role="status" tabIndex={-1} className="rounded-lg border border-green/40 bg-green-light p-6">
        <p className="font-heading text-xl font-bold text-navy">Thank you. Your request was received.</p>
        <p className="mt-2 text-navy-dark">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate aria-describedby="inquiry-required-note">
      <FormMessage state={state} />
      <p id="inquiry-required-note" className="mb-5">
        Fields marked with <span className="text-danger">*</span> are required. It takes about two minutes.
      </p>

      <fieldset className="mb-4">
        <legend className={legendClass}>Your community</legend>
        <TextInput label="Community name" name="facilityName" defaultValue={v.facilityName} required autoComplete="organization" error={e.facilityName} />
        <div className="grid gap-x-5 sm:grid-cols-[1fr_8rem]">
          <TextInput label="City" name="city" defaultValue={v.city} required autoComplete="address-level2" error={e.city} />
          <TextInput label="State" name="state" defaultValue={v.state ?? "OH"} required autoComplete="address-level1" maxLength={2} error={e.state} />
        </div>
        <Select
          label="Community type"
          name="communityType"
          defaultValue={v.communityType ?? ""}
          required
          placeholder="Choose one"
          options={COMMUNITY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          error={e.communityType}
        />
        <TextInput label="Approximate number of residents" name="residentCount" defaultValue={v.residentCount} inputMode="numeric" error={e.residentCount} />
      </fieldset>

      <fieldset className="mb-4">
        <legend className={legendClass}>Your contact information</legend>
        <TextInput label="Your name" name="contactName" defaultValue={v.contactName} required autoComplete="name" error={e.contactName} />
        <TextInput label="Job title" name="contactTitle" defaultValue={v.contactTitle} autoComplete="organization-title" hint="For example, Executive Director or Life Enrichment Director" error={e.contactTitle} />
        <TextInput label="Email" name="email" defaultValue={v.email} type="email" required autoComplete="email" inputMode="email" error={e.email} />
        <TextInput label="Phone" name="phone" defaultValue={v.phone} type="tel" autoComplete="tel" inputMode="tel" error={e.phone} />
      </fieldset>

      <fieldset className="mb-2">
        <legend className={legendClass}>Program preferences</legend>
        <Select
          label="Preferred frequency of visits"
          name="visitFrequency"
          defaultValue={v.visitFrequency ?? ""}
          placeholder="Choose one"
          options={VISIT_FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
          error={e.visitFrequency}
        />
        <Select
          label="Type of program"
          name="interest"
          defaultValue={v.interest ?? ""}
          placeholder="Choose one"
          options={FACILITY_INTERESTS.map((i) => ({ value: i.value, label: i.label }))}
          error={e.interest}
        />
        <TextArea
          label="Additional information"
          name="message"
          defaultValue={v.message}
          rows={5}
          hint="Resident needs, preferred days or times, or questions for us."
          error={e.message}
        />
      </fieldset>

      {/* Honeypot field for spam bots: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pendingText="Sending your request..." size="lg" className="w-full sm:w-auto">
        Request a Community Partnership Proposal
      </SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Select, TextArea, TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";
import { submitContactMessage } from "./actions";
import { CONTACT_TOPICS } from "./schema";

export function ContactForm({ defaultTopic = "" }: { defaultTopic?: string }) {
  const [state, action] = useActionState(submitContactMessage, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = (state.data?.values ?? {}) as Record<string, string>;

  if (state.ok) {
    return (
      <div role="status" className="rounded-lg border border-green/40 bg-green-light p-6">
        <p className="font-heading text-xl font-bold text-navy">Message sent</p>
        <p className="mt-2 text-navy-dark">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate aria-describedby="contact-required-note">
      <FormMessage state={state} />
      <p id="contact-required-note" className="mb-4 text-sm">
        Fields marked with <span className="text-danger">*</span> are required. Please include an email address or a phone number so we can reply.
      </p>
      <TextInput label="Your name" name="name" required autoComplete="name" defaultValue={v.name} error={e.name} />
      <div className="grid gap-x-5 md:grid-cols-2">
        <TextInput label="Email" name="email" type="email" autoComplete="email" defaultValue={v.email} error={e.email} />
        <TextInput label="Phone" name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} error={e.phone} />
      </div>
      <Select
        label="What is this about?"
        name="topic"
        placeholder="Choose a topic"
        defaultValue={v.topic ?? defaultTopic}
        options={CONTACT_TOPICS.map((t) => ({ value: t.value, label: t.label }))}
        error={e.topic}
      />
      <TextArea
        label="How can we help?"
        name="message"
        required
        rows={6}
        hint="Please do not include passwords, card numbers, or medical details."
        defaultValue={v.message}
        error={e.message}
      />
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pendingText="Sending..." size="lg">
        Send Message
      </SubmitButton>
    </form>
  );
}

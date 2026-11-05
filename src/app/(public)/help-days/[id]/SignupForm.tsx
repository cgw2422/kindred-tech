"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { initialActionState } from "@/lib/forms";
import { reserveHelpDaySlotAction } from "./actions";

export type SignupSlot = { startsAt: string; label: string; available: boolean };

const inputClass =
  "block w-full rounded-md border-2 border-line bg-white px-3 py-3 text-lg text-navy-dark placeholder:text-gray-500 focus:border-navy focus:outline-none";

function Labeled({ id, label, required, hint, children }: { id: string; label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-lg font-semibold text-navy">
        {label}
        {required ? <span className="text-danger"> *</span> : <span className="ml-1 text-base font-normal text-body">(optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mb-1 text-base">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export function SignupForm({ helpDayId, slots, priceNote }: { helpDayId: string; slots: SignupSlot[]; priceNote: string }) {
  const [state, dispatch, pending] = useActionState(reserveHelpDaySlotAction, initialActionState);
  const [forFamily, setForFamily] = useState(false);
  const router = useRouter();

  // A slot was just taken by someone else: reload the list of open times.
  useEffect(() => {
    if (!state.ok && state.data?.code === "SLOT_TAKEN") router.refresh();
  }, [state, router]);

  // Submit via a transition (not the form action prop) so typed values are kept when there is an error.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  if (state.ok) {
    const label = slots.find((s) => s.startsAt === state.data?.startsAt)?.label;
    return (
      <div role="status" className="rounded-lg border-2 border-green bg-green-light p-6">
        <h2 className="mb-2 text-2xl">You&apos;re all set</h2>
        <p className="text-lg">
          Your time{label ? ` at ${label}` : ""} is reserved. Your confirmation number is <strong>{String(state.data?.reference ?? "")}</strong>.
        </p>
        <p className="mt-2 text-lg">
          Please bring your device, its charger, and any passwords you know. If we have your email address, we have sent a confirmation. If you can no longer come, please let your community&apos;s front
          desk know.
        </p>
        <p className="mt-4">
          <a href={`/help-days/${helpDayId}`} className="font-semibold">
            Reserve another time
          </a>
        </p>
      </div>
    );
  }

  const open = slots.filter((s) => s.available);
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="rounded-lg border border-line bg-white p-5 md:p-7">
      <FormMessage state={state} />
      <input type="hidden" name="helpDayId" value={helpDayId} />
      <div aria-hidden="true" className="hidden">
        <label>
          Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset className="mb-6">
        <legend className="mb-2 text-xl font-heading text-navy">1. Choose a time</legend>
        {open.length === 0 ? (
          <p className="text-lg">All times are taken. Please ask your community&apos;s front desk about the next Tech Help Day.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {slots.map((s) => (
              <label
                key={s.startsAt}
                className={`flex min-h-[56px] items-center justify-center gap-2 rounded-md border-2 px-3 py-2 text-lg font-semibold ${
                  s.available ? "cursor-pointer border-navy bg-white text-navy has-[:checked]:border-green has-[:checked]:bg-green has-[:checked]:text-white" : "cursor-not-allowed border-line bg-soft text-body line-through"
                }`}
              >
                <input type="radio" name="startsAt" value={s.startsAt} disabled={!s.available} required className="sr-only" />
                {s.label}
                {!s.available && <span className="sr-only">(taken)</span>}
              </label>
            ))}
          </div>
        )}
        <p className="mt-2 text-base">{priceNote}</p>
      </fieldset>

      <fieldset className="mb-6">
        <legend className="mb-2 text-xl font-heading text-navy">2. About the resident</legend>
        <label className="mb-4 flex cursor-pointer items-start gap-3 text-lg">
          <input type="checkbox" name="forFamily" checked={forFamily} onChange={(e) => setForFamily(e.target.checked)} className="mt-1 h-6 w-6 accent-green" />
          <span>I am a family member reserving a time for a resident</span>
        </label>
        <div className="grid gap-x-6 md:grid-cols-2">
          <Labeled id="firstName" label="Resident's first name" required>
            <input id="firstName" name="firstName" required autoComplete={forFamily ? "off" : "given-name"} maxLength={100} className={inputClass} />
          </Labeled>
          <Labeled id="lastName" label="Resident's last name" required>
            <input id="lastName" name="lastName" required autoComplete={forFamily ? "off" : "family-name"} maxLength={100} className={inputClass} />
          </Labeled>
          <Labeled id="unit" label="Apartment or unit number">
            <input id="unit" name="unit" maxLength={50} className={inputClass} />
          </Labeled>
          <Labeled id="phone" label="Resident's phone" required={!forFamily} hint="So we can reach you if anything changes.">
            <input id="phone" name="phone" type="tel" autoComplete={forFamily ? "off" : "tel"} required={!forFamily} aria-describedby="phone-hint" className={inputClass} />
          </Labeled>
          <Labeled id="email" label="Resident's email" hint="We will email a confirmation.">
            <input id="email" name="email" type="email" autoComplete={forFamily ? "off" : "email"} aria-describedby="email-hint" className={inputClass} />
          </Labeled>
        </div>
        {forFamily && (
          <div className="mt-2 rounded-md border border-line bg-soft p-4">
            <p className="mb-3 text-lg font-semibold text-navy">About you (the family member)</p>
            <div className="grid gap-x-6 md:grid-cols-2">
              <Labeled id="requesterName" label="Your name" required>
                <input id="requesterName" name="requesterName" required autoComplete="name" maxLength={200} className={inputClass} />
              </Labeled>
              <Labeled id="requesterRelation" label="Relationship to the resident">
                <input id="requesterRelation" name="requesterRelation" placeholder="e.g. Daughter" maxLength={100} className={inputClass} />
              </Labeled>
              <Labeled id="requesterPhone" label="Your phone">
                <input id="requesterPhone" name="requesterPhone" type="tel" autoComplete="tel" className={inputClass} />
              </Labeled>
              <Labeled id="requesterEmail" label="Your email" hint="We will send you the confirmation too.">
                <input id="requesterEmail" name="requesterEmail" type="email" autoComplete="email" aria-describedby="requesterEmail-hint" className={inputClass} />
              </Labeled>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="mb-6">
        <legend className="mb-2 text-xl font-heading text-navy">3. What would you like help with?</legend>
        <Labeled id="problemDescription" label="A few words is plenty" hint="For example: setting up email on a new iPad, or photos on my phone.">
          <textarea id="problemDescription" name="problemDescription" rows={3} maxLength={4000} aria-describedby="problemDescription-hint" className={inputClass} />
        </Labeled>
      </fieldset>

      <label className="mb-6 flex cursor-pointer items-start gap-3 text-lg">
        <input type="checkbox" name="acceptedTerms" required className="mt-1 h-6 w-6 shrink-0 accent-green" />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank">
            terms of service
          </Link>
          . Our technician will only access your devices and accounts with your permission.
        </span>
      </label>
      <button type="submit" disabled={pending || open.length === 0} aria-disabled={pending} className={buttonClass("primary", "lg")}>
        {pending ? "Reserving..." : "Reserve my time"}
      </button>
    </form>
  );
}

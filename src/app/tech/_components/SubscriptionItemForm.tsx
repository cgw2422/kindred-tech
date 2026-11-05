"use client";

import { useActionState, useId, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { initialActionState, type ActionState } from "@/lib/forms";
import { centsToDollarString, formatCents, parseDollarsToCents } from "@/lib/money";
import {
  DECISION_LABELS,
  FREQUENCY_LABELS,
  monthlyEquivalentCents,
  SUBSCRIPTION_CATEGORY_LABELS,
  suggestMonthlySavingsCents,
  type Decision,
  type Frequency,
} from "@/lib/subscriptions";

export type SubscriptionItemValues = {
  id?: string;
  name: string;
  category: string;
  priceCents: number;
  frequency: Frequency;
  decision: Decision;
  cancellationAssisted: boolean;
  estimatedMonthlySavingsCents: number;
  followUpNeeded: boolean;
  followUpNotes: string | null;
};

const input =
  "block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark focus:border-navy focus:outline-none";
const label = "mb-1 block font-semibold text-navy";

export function SubscriptionItemForm({
  action,
  appointmentId,
  item,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  appointmentId: string;
  item?: SubscriptionItemValues;
  submitLabel: string;
}) {
  const uid = useId();
  const [state, formAction] = useActionState(action, initialActionState);
  const [price, setPrice] = useState(item ? centsToDollarString(item.priceCents) : "");
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? "MONTHLY");
  const [decision, setDecision] = useState<Decision>(item?.decision ?? "UNDECIDED");
  const initialSuggestion = item ? suggestMonthlySavingsCents(item) : 0;
  const [touched, setTouched] = useState(Boolean(item && item.estimatedMonthlySavingsCents !== initialSuggestion));
  const [savings, setSavings] = useState(item ? centsToDollarString(item.estimatedMonthlySavingsCents) : "");

  // Reset the "add" form after a successful save (React 19 resets uncontrolled fields itself).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok && !item) {
      setPrice("");
      setFrequency("MONTHLY");
      setDecision("UNDECIDED");
      setTouched(false);
      setSavings("");
    }
  }

  const priceCents = parseDollarsToCents(price) ?? 0;
  const suggestion = suggestMonthlySavingsCents({ priceCents, frequency, decision });
  const monthly = monthlyEquivalentCents(priceCents, frequency);
  const shownSavings = touched ? savings : centsToDollarString(suggestion);
  const f = (n: string) => `${uid}-${n}`;

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {item?.id && <input type="hidden" name="itemId" value={item.id} />}
      <input type="hidden" name="savingsAuto" value={touched ? "0" : "1"} />
      <div>
        <label htmlFor={f("name")} className={label}>
          Subscription name <span className="text-danger">*</span>
        </label>
        <input id={f("name")} name="name" required maxLength={120} defaultValue={item?.name} className={input} placeholder="e.g. Netflix, Norton, iCloud" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={f("category")} className={label}>
            Category
          </label>
          <select id={f("category")} name="category" defaultValue={item?.category ?? "STREAMING"} className={input}>
            {Object.entries(SUBSCRIPTION_CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={f("decision")} className={label}>
            Customer&apos;s decision
          </label>
          <select id={f("decision")} name="decision" value={decision} onChange={(e) => setDecision(e.target.value as Decision)} className={input}>
            {Object.entries(DECISION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={f("price")} className={label}>
            Price ($) <span className="text-danger">*</span>
          </label>
          <input id={f("price")} name="price" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={input} placeholder="15.99" />
        </div>
        <div>
          <label htmlFor={f("frequency")} className={label}>
            Billed
          </label>
          <select id={f("frequency")} name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={input}>
            {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-body">
        Monthly equivalent: <strong>{monthly == null ? "unknown billing period" : formatCents(monthly)}</strong>
      </p>
      <div>
        <label htmlFor={f("savings")} className={label}>
          Estimated monthly savings ($)
        </label>
        <p id={f("savings-hint")} className="mb-1 text-sm text-body">
          {touched ? (
            <>
              Entered by you.{" "}
              <button
                type="button"
                className="font-semibold text-navy underline"
                onClick={() => {
                  setTouched(false);
                  setSavings("");
                }}
              >
                Use suggestion ({formatCents(suggestion)})
              </button>
            </>
          ) : (
            "Suggested automatically. For cancellations this is the full monthly cost; enter the difference for downgrades or switches."
          )}
        </p>
        <input
          id={f("savings")}
          name="estimatedMonthlySavings"
          inputMode="decimal"
          aria-describedby={f("savings-hint")}
          value={shownSavings}
          onChange={(e) => {
            setTouched(true);
            setSavings(e.target.value);
          }}
          className={input}
        />
      </div>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <input id={f("assist")} type="checkbox" name="cancellationAssisted" defaultChecked={item?.cancellationAssisted} className="mt-1 h-6 w-6 shrink-0 accent-green" />
          <label htmlFor={f("assist")} className="text-navy">
            We helped the customer cancel or change this (with their permission)
          </label>
        </div>
        <div className="flex items-start gap-3">
          <input id={f("follow")} type="checkbox" name="followUpNeeded" defaultChecked={item?.followUpNeeded} className="mt-1 h-6 w-6 shrink-0 accent-green" />
          <label htmlFor={f("follow")} className="text-navy">
            Follow-up needed
          </label>
        </div>
      </div>
      <div>
        <label htmlFor={f("notes")} className={label}>
          Follow-up notes <span className="text-sm font-normal text-body">(optional)</span>
        </label>
        <textarea id={f("notes")} name="followUpNotes" rows={2} maxLength={1000} defaultValue={item?.followUpNotes ?? ""} className={input} />
      </div>
      <SubmitButton size="lg" className="w-full">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

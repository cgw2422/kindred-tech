"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Checkbox, Select, TextArea, TextInput } from "@/components/ui";
import { initialActionState } from "@/lib/forms";
import {
  activateMembershipAction,
  cancelMembershipAction,
  createMembershipAction,
  membershipCheckoutLinkAction,
  membershipStateAction,
  recordUsageAction,
  savePlanAction,
} from "../actions";
import { CopyLink } from "../../invoices/_components/InvoiceForms";

export function CreateMembershipForm({
  customerId,
  plans,
  contacts,
}: {
  customerId: string;
  plans: { id: string; label: string }[];
  contacts: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(createMembershipAction, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <Select label="Plan" name="planId" required options={plans.map((p) => ({ value: p.id, label: p.label }))} />
      <Select
        label="Paid for by"
        name="purchaserContactId"
        placeholder="The customer"
        options={contacts.map((c) => ({ value: c.id, label: c.label }))}
        hint={contacts.length ? "Family contacts the customer has authorized to pay (e.g. an adult child buying for a parent)." : "No family contacts are authorized to pay for this customer."}
      />
      <TextInput label="Custom price ($)" name="price" inputMode="decimal" placeholder="Plan price" hint="Leave blank to use the plan's price." error={state.fieldErrors?.price} />
      <SubmitButton pendingText="Creating...">Create pending membership</SubmitButton>
    </form>
  );
}

export function CheckoutLinkForm({ membershipId }: { membershipId: string }) {
  const [state, action] = useActionState(membershipCheckoutLinkAction, initialActionState);
  const url = state.data?.checkoutUrl as string | undefined;
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="membershipId" value={membershipId} />
      {url ? (
        <div className="space-y-2">
          <CopyLink url={url} />
          <a href={url} className="font-semibold" target="_blank" rel="noopener noreferrer">
            Open Stripe checkout
          </a>
          <p className="text-sm text-body">Stripe checkout links expire after 24 hours.</p>
        </div>
      ) : (
        <SubmitButton pendingText="Creating link...">Create Stripe checkout link</SubmitButton>
      )}
    </form>
  );
}

export function ActivateForm({ membershipId }: { membershipId: string }) {
  const [state, action] = useActionState(activateMembershipAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <TextArea label="Note" name="note" rows={2} hint="e.g. Paid by check #1234 for the first month." maxLength={1000} />
      <Checkbox name="sendWelcome" label="Send the welcome email" defaultChecked />
      <SubmitButton variant="secondary" pendingText="Activating..." confirm="Activate this membership without online payment?">
        Activate manually
      </SubmitButton>
    </form>
  );
}

export function CancelForm({ membershipId, allowPeriodEnd }: { membershipId: string; allowPeriodEnd: boolean }) {
  const [state, action] = useActionState(cancelMembershipAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <TextInput label="Reason" name="reason" maxLength={500} />
      <div className="flex flex-wrap gap-2">
        {allowPeriodEnd && (
          <SubmitButton name="when" value="period_end" variant="outline" size="sm" pendingText="Saving..." confirm="Cancel at the end of the current period?">
            Cancel at period end
          </SubmitButton>
        )}
        <SubmitButton name="when" value="now" variant="danger" size="sm" pendingText="Canceling..." confirm="Cancel this membership immediately? Benefits stop now.">
          Cancel immediately
        </SubmitButton>
      </div>
    </form>
  );
}

export function StateButton({ membershipId, op, label, confirm, variant = "outline" }: { membershipId: string; op: "pause" | "resume" | "keep" | "renew"; label: string; confirm?: string; variant?: "outline" | "secondary" | "ghost" }) {
  const [state, action] = useActionState(membershipStateAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton variant={variant} size="sm" pendingText="Saving..." confirm={confirm}>
        {label}
      </SubmitButton>
    </form>
  );
}

export function UsageForm({ membershipId, options, remaining }: { membershipId: string; options: { value: string; label: string }[]; remaining: number }) {
  const [state, action] = useActionState(recordUsageAction, initialActionState);
  const [type, setType] = useState(options[0]?.value ?? "");
  if (options.length === 0) return <p className="text-sm">This plan has no benefits to record.</p>;
  return (
    <form action={action} noValidate key={state.ok ? state.message : "f"}>
      <FormMessage state={state} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Select label="Benefit" name="type" required options={options} value={type} onChange={(e) => setType(e.target.value)} />
      {type === "REMOTE_MINUTES" && <TextInput label="Minutes used" name="minutes" type="number" min={1} max={remaining || undefined} required hint={`${remaining} minutes remaining this period.`} error={state.fieldErrors?.minutes} />}
      {type === "IN_HOME_DISCOUNT" && <TextInput label="Visit price before discount ($)" name="visitPrice" inputMode="decimal" required error={state.fieldErrors?.visitPrice} />}
      <TextInput label="Note" name="notes" maxLength={500} />
      <SubmitButton variant="secondary" pendingText="Recording...">
        Record usage
      </SubmitButton>
    </form>
  );
}

export type PlanFormValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  interval: "MONTH" | "YEAR";
  stripePriceId: string;
  priorityScheduling: boolean;
  remoteMinutesPerPeriod: number;
  annualReviewIncluded: boolean;
  inHomeDiscountPercent: number;
  benefitsText: string;
  isActive: boolean;
};

export function PlanForm({ plan }: { plan: PlanFormValues }) {
  const [state, action] = useActionState(savePlanAction, initialActionState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      {plan.id && <input type="hidden" name="planId" value={plan.id} />}
      <div className="grid gap-x-4 md:grid-cols-2">
        <TextInput label="Name" name="name" defaultValue={plan.name} required error={e.name} />
        <TextInput label="Slug" name="slug" defaultValue={plan.slug} required error={e.slug} hint="Used in links, e.g. kindred-care-monthly" />
        <TextInput label="Price ($)" name="price" inputMode="decimal" defaultValue={plan.price} required error={e.price} />
        <Select label="Billing interval" name="interval" defaultValue={plan.interval} required options={[{ value: "MONTH", label: "Monthly" }, { value: "YEAR", label: "Yearly" }]} />
        <TextInput label="Remote support minutes per period" name="remoteMinutesPerPeriod" type="number" min={0} defaultValue={plan.remoteMinutesPerPeriod} error={e.remoteMinutesPerPeriod} />
        <TextInput label="In-home visit discount (%)" name="inHomeDiscountPercent" type="number" min={0} max={50} defaultValue={plan.inHomeDiscountPercent} error={e.inHomeDiscountPercent} hint="A discount only. Plans never include unlimited in-home visits." />
        <TextInput label="Stripe price id" name="stripePriceId" defaultValue={plan.stripePriceId} error={e.stripePriceId} hint="Optional. If blank, Checkout creates the price from the amount above." />
      </div>
      <TextArea label="Description" name="description" rows={2} defaultValue={plan.description} error={e.description} />
      <TextArea label="Benefit lines (one per line)" name="benefitsText" rows={4} defaultValue={plan.benefitsText} error={e.benefitsText} />
      <div className="flex flex-wrap gap-x-6">
        <Checkbox name="priorityScheduling" label="Priority scheduling" defaultChecked={plan.priorityScheduling} />
        <Checkbox name="annualReviewIncluded" label="Annual technology review" defaultChecked={plan.annualReviewIncluded} />
        <Checkbox name="isActive" label="Available for new members" defaultChecked={plan.isActive} />
      </div>
      <SubmitButton pendingText="Saving...">{plan.id ? "Save plan" : "Create plan"}</SubmitButton>
    </form>
  );
}

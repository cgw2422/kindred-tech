"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Button, Checkbox, Select, TextArea, TextInput } from "@/components/ui";
import { initialActionState, type ActionState } from "@/lib/forms";
import {
  createInvoiceAction,
  issueInvoiceAction,
  recordManualPaymentAction,
  refundPaymentAction,
  regeneratePayLinkAction,
  updateInvoiceLinesAction,
  voidInvoiceAction,
} from "../actions";

export type EditorLine = { description: string; quantity: number; unitPrice: string; serviceId?: string | null };
export type ServiceOption = { id: string; name: string; basePriceCents: number };

function toCents(v: string): number {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function money(cents: number) {
  return (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toFixed(2);
}

const cellInput = "block w-full rounded-md border-2 border-line bg-white px-2 py-2 text-base focus:border-navy focus:outline-none";

export function LineEditor({ initial, services }: { initial: EditorLine[]; services: ServiceOption[] }) {
  const [lines, setLines] = useState<EditorLine[]>(initial.length ? initial : [{ description: "", quantity: 1, unitPrice: "" }]);
  const update = (i: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const subtotal = lines.reduce((s, l) => s + Math.max(1, Math.floor(l.quantity || 1)) * toCents(l.unitPrice), 0);
  return (
    <fieldset className="mb-4">
      <legend className="mb-2 font-semibold text-navy">Line items</legend>
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr] gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_80px_120px_auto] sm:items-end">
            <label className="text-sm font-semibold text-navy">
              Description
              <input className={cellInput} value={l.description} maxLength={300} onChange={(e) => update(i, { description: e.target.value })} required />
            </label>
            <label className="text-sm font-semibold text-navy">
              Qty
              <input className={cellInput} type="number" min={1} value={l.quantity} onChange={(e) => update(i, { quantity: parseInt(e.target.value, 10) || 1 })} />
            </label>
            <label className="text-sm font-semibold text-navy">
              Unit price ($)
              <input className={cellInput} inputMode="decimal" value={l.unitPrice} placeholder="0.00" onChange={(e) => update(i, { unitPrice: e.target.value })} />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-1 text-sm text-body">Use a negative price for a discount line. Tax is added from billing settings.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { description: "", quantity: 1, unitPrice: "" }])}>
          Add line
        </Button>
        {services.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Add a service</span>
            <select
              className="rounded-md border-2 border-line px-2 py-1.5"
              value=""
              onChange={(e) => {
                const s = services.find((x) => x.id === e.target.value);
                if (s) setLines((ls) => [...ls.filter((l) => l.description || l.unitPrice), { description: s.name, quantity: 1, unitPrice: (s.basePriceCents / 100).toFixed(2), serviceId: s.id }]);
              }}
            >
              <option value="">Add a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({money(s.basePriceCents)})
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="ml-auto font-semibold text-navy">Lines total: {money(subtotal)} (before tax)</span>
      </div>
    </fieldset>
  );
}

export function NewInvoiceForm({
  customerId,
  facilityId,
  contacts,
  services,
}: {
  customerId?: string | null;
  facilityId?: string | null;
  contacts: { id: string; name: string; relationship: string | null }[];
  services: ServiceOption[];
}) {
  const [state, action] = useActionState(createInvoiceAction, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      {facilityId && <input type="hidden" name="facilityId" value={facilityId} />}
      {customerId && (
        <Select
          label="Bill to"
          name="billToContactId"
          placeholder="The customer"
          options={contacts.map((c) => ({ value: c.id, label: `${c.name}${c.relationship ? ` (${c.relationship})` : ""} — family payer` }))}
          hint={contacts.length ? "Only family contacts the customer has authorized to pay are listed." : "No family contacts are authorized to pay for this customer."}
        />
      )}
      <LineEditor initial={[]} services={services} />
      <TextInput label="Deposit ($)" name="deposit" inputMode="decimal" placeholder="0.00" hint="Optional. Lets the customer pay this amount first online." error={state.fieldErrors?.deposit} />
      <TextArea label="Notes shown on the invoice" name="notes" rows={3} maxLength={2000} />
      <SubmitButton pendingText="Creating...">Create draft invoice</SubmitButton>
    </form>
  );
}

export function EditInvoiceForm({ invoiceId, initialLines, depositDollars, notes, services }: { invoiceId: string; initialLines: EditorLine[]; depositDollars: string; notes: string; services: ServiceOption[] }) {
  const [state, action] = useActionState(updateInvoiceLinesAction, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <LineEditor initial={initialLines} services={services} />
      <TextInput label="Deposit ($)" name="deposit" inputMode="decimal" defaultValue={depositDollars} />
      <TextArea label="Notes shown on the invoice" name="notes" rows={3} defaultValue={notes} maxLength={2000} />
      <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input readOnly value={url} aria-label="Customer pay link" className="w-full rounded-md border-2 border-line bg-soft px-3 py-2 text-sm" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

function LinkResult({ state }: { state: ActionState }) {
  const url = state.data?.payUrl as string | undefined;
  return url ? (
    <div className="mt-3">
      <p className="mb-1 text-sm font-semibold text-navy">Customer pay link</p>
      <CopyLink url={url} />
    </div>
  ) : null;
}

export function IssueInvoiceForm({ invoiceId, hasEmail }: { invoiceId: string; hasEmail: boolean }) {
  const [state, action] = useActionState(issueInvoiceAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {!state.ok && (
        <>
          <Checkbox name="sendEmail" label="Email the invoice with a pay link" defaultChecked={hasEmail} disabled={!hasEmail} hint={hasEmail ? undefined : "No email address on file for the bill-to recipient."} />
          <SubmitButton pendingText="Issuing...">Issue invoice</SubmitButton>
        </>
      )}
      <LinkResult state={state} />
    </form>
  );
}

export function RegenerateLinkForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(regeneratePayLinkAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton variant="ghost" size="sm" pendingText="Creating..." confirm="Create a new pay link? The link the customer already has will stop working.">
        Create a new pay link
      </SubmitButton>
      <LinkResult state={state} />
    </form>
  );
}

export function ManualPaymentForm({ invoiceId, balanceDollars }: { invoiceId: string; balanceDollars: string }) {
  const [state, action] = useActionState(recordManualPaymentAction, initialActionState);
  return (
    <form action={action} noValidate key={state.ok ? state.message : "form"}>
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextInput label="Amount received ($)" name="amount" inputMode="decimal" defaultValue={balanceDollars} required error={state.fieldErrors?.amount} />
        <Select label="Method" name="method" required options={[{ value: "CASH", label: "Cash" }, { value: "CHECK", label: "Check" }, { value: "OTHER", label: "Other" }]} />
        <TextInput label="Check number / reference" name="reference" maxLength={100} />
        <TextInput label="Date received" name="receivedAt" type="date" />
      </div>
      <TextInput label="Note" name="notes" maxLength={500} />
      <SubmitButton variant="secondary" pendingText="Recording...">
        Record manual payment
      </SubmitButton>
    </form>
  );
}

export function VoidInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(voidInvoiceAction, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton variant="danger" size="sm" pendingText="Voiding..." confirm="Void this invoice? This cannot be undone and the pay link will stop working.">
        Void invoice
      </SubmitButton>
    </form>
  );
}

export function RefundForm({ paymentId, maxDollars, isStripe }: { paymentId: string; maxDollars: string; isStripe: boolean }) {
  const [state, action] = useActionState(refundPaymentAction, initialActionState);
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-semibold text-navy">Refund…</summary>
      <form action={action} noValidate className="mt-2 rounded-md border border-line p-3" key={state.ok ? state.message : "form"}>
        <FormMessage state={state} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <TextInput label="Refund amount ($)" name="amount" inputMode="decimal" defaultValue={maxDollars} required hint={`Up to $${maxDollars}`} />
        <TextInput label="Reason" name="reason" maxLength={500} />
        <SubmitButton
          variant="danger"
          size="sm"
          pendingText="Refunding..."
          confirm={isStripe ? "Send this refund to the customer's card through Stripe?" : "Record that this money was returned to the customer?"}
        >
          {isStripe ? "Refund to card" : "Record manual refund"}
        </SubmitButton>
      </form>
    </details>
  );
}

export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      Print
    </Button>
  );
}

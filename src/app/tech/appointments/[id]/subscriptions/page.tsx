import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/forms";
import { Badge, Notice } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { computeSavingsTotals, DECISION_LABELS, FREQUENCY_LABELS, monthlyEquivalentCents, SUBSCRIPTION_CATEGORY_LABELS } from "@/lib/subscriptions";
import { getTechSubscriptionReview } from "@/lib/tech/subscription-review";
import { formatDateTime } from "@/lib/time";
import { getTechContext } from "../../../_lib/context";
import { ActionForm } from "../../../_components/ActionForm";
import { SubscriptionItemForm } from "../../../_components/SubscriptionItemForm";
import { authorizeReviewAction, removeSubscriptionItemAction, saveReviewNotesAction, saveSubscriptionItemAction } from "../../../actions";

export const metadata: Metadata = { title: "Subscription review" };

const card = "rounded-lg border border-line bg-white p-4";
const inputClass = "block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark focus:border-navy focus:outline-none";

function Reminders() {
  return (
    <div role="note" aria-labelledby="rules-h" className="rounded-lg border-2 border-danger/40 bg-danger-light p-4 text-danger">
      <h2 id="rules-h" className="text-lg text-danger">
        Important reminders
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold">
        <li>Never ask for, write down, or record online banking passwords.</li>
        <li>Do not log into the customer&apos;s bank, credit card or other financial accounts.</li>
        <li>Make changes only with the customer&apos;s permission, one at a time, while they watch.</li>
      </ul>
    </div>
  );
}

export default async function SubscriptionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { technician, tz } = await getTechContext();
  if (!technician) return null;
  const { id } = await params;
  const data = await getTechSubscriptionReview(technician.id, id);
  if (!data) notFound();
  const { appointment, review } = data;
  const canRecord = ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"].includes(appointment.status);
  const items = review?.items ?? [];
  const totals = computeSavingsTotals(items);
  const customerName = `${appointment.customer.firstName} ${appointment.customer.lastName}`;

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/tech/appointments/${appointment.id}`} className="inline-flex min-h-[44px] items-center font-semibold">
          <span aria-hidden="true">‹&nbsp;</span>Back to job
        </Link>
        <p className="text-sm font-semibold uppercase tracking-wider text-green">Subscription Review &amp; Savings</p>
        <h1 className="text-2xl">{appointment.customer.preferredName || appointment.customer.firstName} {appointment.customer.lastName}</h1>
      </div>

      <Reminders />

      {!canRecord ? (
        <Notice tone="warn">Subscription reviews can only be recorded on confirmed or active appointments.</Notice>
      ) : !review?.authorizationConfirmed ? (
        <section aria-labelledby="auth-h" className={card}>
          <h2 id="auth-h" className="text-xl">
            Step 1: Customer authorization
          </h2>
          <p className="mt-1">Before looking at any subscriptions, read this to the customer and record their answer:</p>
          <blockquote className="my-3 border-l-4 border-green bg-green-light p-3 italic text-navy">
            &ldquo;May we review your subscriptions with you? We will only make the changes you approve, and we will never ask for your banking passwords.&rdquo;
          </blockquote>
          <ActionForm action={authorizeReviewAction}>
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <label htmlFor="authorizedByName" className="mb-1 block font-semibold text-navy">
              Name of the person authorizing <span className="text-danger">*</span>
            </label>
            <input id="authorizedByName" name="authorizedByName" required maxLength={120} defaultValue={customerName} className={inputClass} />
            <fieldset className="mt-3">
              <legend className="mb-1 font-semibold text-navy">How was it given?</legend>
              <div className="flex gap-4">
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="method" value="VERBAL" defaultChecked className="h-5 w-5 accent-green" /> Verbally
                </label>
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="method" value="SIGNATURE" className="h-5 w-5 accent-green" /> In writing
                </label>
              </div>
            </fieldset>
            <div className="mt-3 flex items-start gap-3">
              <input id="confirmed" type="checkbox" name="confirmed" required className="mt-1 h-6 w-6 shrink-0 accent-green" />
              <label htmlFor="confirmed" className="font-semibold text-navy">
                Customer authorized us to review subscriptions and make only the changes they approve
              </label>
            </div>
            <SubmitButton size="lg" className="mt-4 w-full">
              Record authorization
            </SubmitButton>
          </ActionForm>
        </section>
      ) : (
        <>
          <p className="text-sm text-body">
            <Badge tone="green">Authorized</Badge> by {review.authorizedByName}
            {review.authorizedAt && ` on ${formatDateTime(review.authorizedAt, tz)}`}
          </p>

          <section aria-labelledby="totals-h" className={card}>
            <h2 id="totals-h" className="text-xl">
              Savings summary
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-soft p-3">
                <dt className="text-sm font-semibold text-body">Current monthly spend</dt>
                <dd className="font-heading text-2xl text-navy">{formatCents(totals.currentMonthlySpendCents)}</dd>
              </div>
              <div className="rounded-md bg-green-light p-3">
                <dt className="text-sm font-semibold text-body">Est. monthly savings</dt>
                <dd className="font-heading text-2xl text-green-dark">{formatCents(totals.estimatedMonthlySavingsCents)}</dd>
              </div>
              <div className="rounded-md bg-green-light p-3">
                <dt className="text-sm font-semibold text-body">Est. annual savings</dt>
                <dd className="font-heading text-2xl text-green-dark">{formatCents(totals.estimatedAnnualSavingsCents)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm font-semibold text-warn">Estimated - not guaranteed. Actual savings depend on each provider&apos;s billing.</p>
            {totals.itemsWithUnknownPeriod > 0 && (
              <p className="mt-1 text-sm text-body">
                {totals.itemsWithUnknownPeriod} subscription{totals.itemsWithUnknownPeriod === 1 ? " has" : "s have"} an unknown billing period and {totals.itemsWithUnknownPeriod === 1 ? "is" : "are"} not included in the monthly spend.
              </p>
            )}
          </section>

          <section aria-labelledby="items-h" className={card}>
            <h2 id="items-h" className="text-xl">
              Subscriptions ({items.length})
            </h2>
            {items.length === 0 ? (
              <p className="mt-2 text-body">None recorded yet. Add each recurring charge below.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {items.map((it) => {
                  const monthly = monthlyEquivalentCents(it.priceCents, it.frequency);
                  return (
                    <li key={it.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-navy">{it.name}</p>
                          <p className="text-sm text-body">
                            {SUBSCRIPTION_CATEGORY_LABELS[it.category]} · {formatCents(it.priceCents)} {FREQUENCY_LABELS[it.frequency].toLowerCase()}
                            {monthly != null && it.frequency !== "MONTHLY" && ` (${formatCents(monthly)}/mo)`}
                          </p>
                          {it.estimatedMonthlySavingsCents > 0 && <p className="text-sm font-semibold text-green-dark">Est. savings {formatCents(it.estimatedMonthlySavingsCents)}/mo</p>}
                          {it.cancellationAssisted && <p className="text-sm text-body">We assisted with this change.</p>}
                          {it.followUpNeeded && (
                            <p className="text-sm text-warn">
                              Follow-up needed{it.followUpNotes ? `: ${it.followUpNotes}` : ""}
                            </p>
                          )}
                        </div>
                        <Badge tone={it.decision === "CANCEL" ? "green" : it.decision === "KEEP" ? "navy" : "neutral"}>{DECISION_LABELS[it.decision]}</Badge>
                      </div>
                      <details className="mt-2">
                        <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold text-navy">Edit {it.name}</summary>
                        <div className="mt-2 rounded-md border border-line p-3">
                          <SubscriptionItemForm
                            action={saveSubscriptionItemAction}
                            appointmentId={appointment.id}
                            submitLabel="Save changes"
                            item={{
                              id: it.id,
                              name: it.name,
                              category: it.category,
                              priceCents: it.priceCents,
                              frequency: it.frequency,
                              decision: it.decision,
                              cancellationAssisted: it.cancellationAssisted,
                              estimatedMonthlySavingsCents: it.estimatedMonthlySavingsCents,
                              followUpNeeded: it.followUpNeeded,
                              followUpNotes: it.followUpNotes,
                            }}
                          />
                          <ActionForm action={removeSubscriptionItemAction} className="mt-3">
                            <input type="hidden" name="appointmentId" value={appointment.id} />
                            <input type="hidden" name="itemId" value={it.id} />
                            <SubmitButton variant="outline" className="w-full" pendingText="Removing..." confirm={`Remove ${it.name} from this review?`}>
                              Remove from review
                            </SubmitButton>
                          </ActionForm>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="add-h" className={card}>
            <h2 id="add-h" className="text-xl">
              Add a subscription
            </h2>
            <div className="mt-3">
              <SubscriptionItemForm action={saveSubscriptionItemAction} appointmentId={appointment.id} submitLabel="Add subscription" />
            </div>
          </section>

          <section aria-labelledby="rnotes-h" className={card}>
            <h2 id="rnotes-h" className="text-xl">
              Review notes
            </h2>
            <ActionForm action={saveReviewNotesAction} className="mt-2">
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <label htmlFor="review-notes" className="sr-only">
                Review notes
              </label>
              <textarea id="review-notes" name="notes" rows={4} maxLength={4000} defaultValue={review.notes ?? ""} className={inputClass} placeholder="Anything to follow up on. Never include passwords or account numbers." />
              <SubmitButton variant="secondary" size="lg" className="mt-3 w-full">
                Save notes
              </SubmitButton>
            </ActionForm>
          </section>
        </>
      )}
    </div>
  );
}

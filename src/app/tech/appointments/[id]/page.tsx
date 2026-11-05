import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { AppointmentStatus } from "@prisma/client";
import { SubmitButton } from "@/components/forms";
import { Badge, Notice } from "@/components/ui";
import { AppointmentStatusBadge, humanize } from "@/components/status";
import { allowedNextStatuses, STATUS_LABELS } from "@/lib/booking/status";
import { formatCents } from "@/lib/money";
import { addressLine, formatDuration, getTechJob, mapsUrl, telHref, totalElapsedMs, type TechJob } from "@/lib/tech/access";
import { parseChecklist } from "@/lib/tech/checklist";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";
import { getTechContext } from "../../_lib/context";
import { ActionForm } from "../../_components/ActionForm";
import { LiveTimer } from "../../_components/LiveTimer";
import { SignaturePad } from "../../_components/SignaturePad";
import {
  addAdditionalWorkAction,
  changeStatusAction,
  checklistAction,
  completeJobAction,
  removeAdditionalWorkAction,
  requestInvoiceAction,
  saveNotesAction,
  saveSignatureAction,
  timerAction,
} from "../../actions";

export const metadata: Metadata = { title: "Job" };

const card = "rounded-lg border border-line bg-white p-4";
const inputClass = "block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark focus:border-navy focus:outline-none";
const labelClass = "mb-1 block font-semibold text-navy";

const STATUS_BUTTON: Partial<Record<AppointmentStatus, { label: string; variant: "primary" | "secondary" | "outline" | "danger" }>> = {
  EN_ROUTE: { label: "On my way (En Route)", variant: "secondary" },
  IN_PROGRESS: { label: "Start job (In Progress)", variant: "primary" },
  NO_SHOW: { label: "Customer not home (No-Show)", variant: "outline" },
};

function Section({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={card}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="text-xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function TechJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { technician, tz } = await getTechContext();
  if (!technician) return null;
  const { id } = await params;
  const job = await getTechJob(technician.id, id);
  if (!job) notFound();

  const wo = job.workOrder;
  const status = job.status;
  const closed = status === "CANCELED" || status === "NO_SHOW" || status === "REQUESTED";
  const completed = status === "COMPLETED";
  const nextStatuses = allowedNextStatuses(status, "TECHNICIAN").filter((s) => s !== "COMPLETED");
  const address = addressLine(job.address);
  const tel = telHref(job.customer.phone);
  const fullName = `${job.customer.preferredName ? `${job.customer.preferredName} (${job.customer.firstName})` : job.customer.firstName} ${job.customer.lastName}`;
  const entries = wo?.timeEntries ?? [];
  const running = entries.some((e) => !e.endedAt);
  const totalMs = totalElapsedMs(entries);
  const checklist = parseChecklist(wo?.checklist ?? null);
  const invoiceLocked = Boolean(wo?.invoiceRequestedAt);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/tech" className="inline-flex min-h-[44px] items-center font-semibold">
          <span aria-hidden="true">‹&nbsp;</span>Back to today
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <AppointmentStatusBadge status={status} />
          <span className="text-sm text-body">Ref. {job.reference}</span>
        </div>
        <h1 className="mt-2 text-2xl">{fullName}</h1>
        <p className="text-body">
          {job.service.name} · {formatDate(job.startsAt, tz, { weekday: "short", month: "short", year: undefined })}, {formatTime(job.startsAt, tz)} – {formatTime(job.endsAt, tz)}
        </p>
      </div>

      {status === "REQUESTED" && <Notice tone="warn">This request has not been confirmed by the office yet. Please wait for confirmation before visiting.</Notice>}
      {(status === "CANCELED" || status === "NO_SHOW") && <Notice tone="danger">This appointment is {STATUS_LABELS[status].toLowerCase()}. No further work can be recorded.</Notice>}

      {/* Status ------------------------------------------------------------ */}
      {nextStatuses.length > 0 && (
        <Section id="status-h" title="Update status">
          <ActionForm action={changeStatusAction} className="grid gap-2">
            <input type="hidden" name="appointmentId" value={job.id} />
            {nextStatuses.map((s) => {
              const b = STATUS_BUTTON[s] ?? { label: STATUS_LABELS[s], variant: "outline" as const };
              return (
                <SubmitButton
                  key={s}
                  name="to"
                  value={s}
                  size="lg"
                  variant={b.variant}
                  className="w-full"
                  pendingText="Updating..."
                  confirm={s === "NO_SHOW" ? "Mark this customer as a no-show? Please make sure you tried calling first." : undefined}
                >
                  {s === "EN_ROUTE" && status === "IN_PROGRESS" ? "Back to En Route" : b.label}
                </SubmitButton>
              );
            })}
          </ActionForm>
          {status === "EN_ROUTE" && <p className="mt-2 text-sm text-body">The customer was emailed that you are on your way.</p>}
        </Section>
      )}

      {/* Customer --------------------------------------------------------- */}
      <Section id="cust-h" title="Customer">
        <p className="font-semibold text-navy">{fullName}</p>
        {tel && (
          <a href={tel} className="mt-2 flex min-h-[48px] items-center justify-center rounded-md border-2 border-navy font-semibold text-navy no-underline">
            Call {job.customer.phone}
          </a>
        )}
        {job.isRemote ? (
          <p className="mt-3">Remote session — call the customer at the scheduled time.</p>
        ) : job.address ? (
          <div className="mt-3">
            <p>{address}</p>
            {job.address.accessNotes && (
              <p className="mt-2 rounded-md bg-warn-light p-3 text-warn">
                <strong>Access notes:</strong> {job.address.accessNotes}
              </p>
            )}
            <a
              href={mapsUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex min-h-[48px] items-center justify-center rounded-md border-2 border-navy font-semibold text-navy no-underline"
            >
              Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        ) : null}
        {job.customer.familyContacts.length > 0 && (
          <div className="mt-4">
            <h3 className="text-base">Authorized family contacts</h3>
            <ul className="mt-1 space-y-1">
              {job.customer.familyContacts.map((c) => {
                const t = telHref(c.phone);
                return (
                  <li key={c.id}>
                    {c.name}
                    {c.relationship && <span className="text-body"> ({c.relationship})</span>}
                    {c.phone && (
                      <>
                        {" · "}
                        {t ? <a href={t}>{c.phone}</a> : c.phone}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>

      {/* Problem & devices ------------------------------------------------- */}
      <Section id="prob-h" title="What they need help with">
        <p className="whitespace-pre-wrap">{job.problemDescription || "No description was provided."}</p>
        <h3 className="mt-4 text-base">Devices on file</h3>
        {job.customer.devices.length === 0 ? (
          <p className="text-body">No devices recorded.</p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {job.customer.devices.map((d) => (
              <li key={d.id}>
                <strong>{d.nickname || humanize(d.type)}</strong>
                {[d.make, d.model, d.os].filter(Boolean).length > 0 && <span> — {[d.make, d.model, d.os].filter(Boolean).join(" ")}</span>}
                {d.notes && <span className="block text-sm text-body">{d.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!closed && (
        <>
          <TimerSection jobId={job.id} running={running} totalMs={totalMs} entries={entries} tz={tz} completed={completed} />
          <ChecklistSection jobId={job.id} items={checklist} />
          <NotesSection job={job} />
          <AdditionalWorkSection jobId={job.id} items={wo?.additionalWork ?? []} locked={invoiceLocked} tz={tz} />

          <Section id="subs-h" title="Subscription Review & Savings">
            <p>
              {wo?.subscriptionReview?.authorizationConfirmed
                ? `Authorized · ${wo.subscriptionReview._count.items} subscription${wo.subscriptionReview._count.items === 1 ? "" : "s"} recorded.`
                : "Help the customer review recurring charges — only with their permission."}
            </p>
            <Link
              href={`/tech/appointments/${job.id}/subscriptions`}
              className="mt-3 flex min-h-[48px] items-center justify-center rounded-md border-2 border-navy font-semibold text-navy no-underline"
            >
              {wo?.subscriptionReview ? "Open subscription review" : "Start subscription review"}
            </Link>
          </Section>

          <SignatureSection job={job} tz={tz} />
          <CompletionSection job={job} tz={tz} />
        </>
      )}
    </div>
  );
}

function TimerSection({
  jobId,
  running,
  totalMs,
  entries,
  tz,
  completed,
}: {
  jobId: string;
  running: boolean;
  totalMs: number;
  entries: { id: string; startedAt: Date; endedAt: Date | null }[];
  tz: string;
  completed: boolean;
}) {
  return (
    <Section id="timer-h" title="Work timer" aside={running ? <Badge tone="green">Running</Badge> : undefined}>
      <LiveTimer key={`${totalMs}-${running}`} totalMs={totalMs} running={running} />
      {!completed || running ? (
        <ActionForm action={timerAction} className="mt-3">
          <input type="hidden" name="appointmentId" value={jobId} />
          <input type="hidden" name="op" value={running ? "stop" : "start"} />
          <SubmitButton size="lg" variant={running ? "danger" : "primary"} className="w-full" pendingText={running ? "Stopping..." : "Starting..."}>
            {running ? "Stop timer" : "Start timer"}
          </SubmitButton>
        </ActionForm>
      ) : null}
      {entries.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-semibold text-navy">Time entries ({entries.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {entries.map((e) => (
              <li key={e.id}>
                {formatTime(e.startedAt, tz)} – {e.endedAt ? formatTime(e.endedAt, tz) : "running"}
                {e.endedAt && <span className="text-body"> ({formatDuration(e.endedAt.getTime() - e.startedAt.getTime())})</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function ChecklistSection({ jobId, items }: { jobId: string; items: { label: string; done: boolean }[] }) {
  const doneCount = items.filter((i) => i.done).length;
  return (
    <Section id="check-h" title="Visit checklist" aside={<span className="text-sm text-body">{doneCount} of {items.length} done</span>}>
      <ActionForm action={checklistAction}>
        <input type="hidden" name="appointmentId" value={jobId} />
        {/* Default button so pressing Enter saves instead of triggering the first "remove" button. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Save checklist
        </button>
        <fieldset>
          <legend className="sr-only">Checklist items</legend>
          <ul className="space-y-1">
            {items.map((item, i) => (
              <li key={`${i}-${item.label}`} className="flex items-center gap-2">
                <label className="flex min-h-[48px] flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="done" value={i} defaultChecked={item.done} className="h-6 w-6 shrink-0 accent-green" />
                  <span className="text-navy">{item.label}</span>
                </label>
                <SubmitButton name="removeIndex" value={String(i)} variant="ghost" size="sm" pendingText="..." confirm={`Remove "${item.label}" from the checklist?`}>
                  <span aria-hidden="true">✕</span>
                  <span className="sr-only">Remove {item.label}</span>
                </SubmitButton>
              </li>
            ))}
          </ul>
        </fieldset>
        <label htmlFor="addLabel" className={`${labelClass} mt-3`}>
          Add a checklist item <span className="text-sm font-normal text-body">(optional)</span>
        </label>
        <input id="addLabel" name="addLabel" maxLength={160} className={inputClass} placeholder="e.g. Set up larger text" />
        <SubmitButton size="lg" variant="secondary" className="mt-3 w-full">
          Save checklist
        </SubmitButton>
      </ActionForm>
    </Section>
  );
}

function NotesSection({ job }: { job: TechJob }) {
  return (
    <Section id="notes-h" title="Notes">
      <ActionForm action={saveNotesAction}>
        <input type="hidden" name="appointmentId" value={job.id} />
        <label htmlFor="troubleshootingNotes" className={labelClass}>
          Troubleshooting notes <span className="text-sm font-normal text-body">(internal)</span>
        </label>
        <p id="tn-hint" className="mb-1 text-sm text-body">
          What you checked and changed. Never record passwords here.
        </p>
        <textarea id="troubleshootingNotes" name="troubleshootingNotes" rows={5} maxLength={10000} aria-describedby="tn-hint" defaultValue={job.workOrder?.troubleshootingNotes ?? ""} className={inputClass} />
        <label htmlFor="resolutionSummary" className={`${labelClass} mt-4`}>
          Visit summary for the customer
        </label>
        <p id="rs-hint" className="mb-1 text-sm text-body">
          Plain-language summary emailed to the customer when the job is completed.
        </p>
        <textarea id="resolutionSummary" name="resolutionSummary" rows={4} maxLength={4000} aria-describedby="rs-hint" defaultValue={job.workOrder?.resolutionSummary ?? ""} className={inputClass} />
        <SubmitButton size="lg" variant="secondary" className="mt-3 w-full">
          Save notes
        </SubmitButton>
      </ActionForm>
    </Section>
  );
}

function AdditionalWorkSection({
  jobId,
  items,
  locked,
  tz,
}: {
  jobId: string;
  items: NonNullable<TechJob["workOrder"]>["additionalWork"];
  locked: boolean;
  tz: string;
}) {
  return (
    <Section id="addl-h" title="Additional work">
      {items.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {items.map((w) => (
            <li key={w.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <p className="font-semibold text-navy">{w.description}</p>
                <p className="text-sm text-body">
                  {formatCents(w.priceCents)} · {w.minutes} min · approved by {w.approvedByName} ({humanize(w.approvalMethod)}) at {formatTime(w.approvedAt, tz)}
                </p>
              </div>
              {!locked && (
                <ActionForm action={removeAdditionalWorkAction}>
                  <input type="hidden" name="appointmentId" value={jobId} />
                  <input type="hidden" name="itemId" value={w.id} />
                  <SubmitButton variant="ghost" size="sm" pendingText="..." confirm="Remove this additional work item?">
                    Remove<span className="sr-only"> {w.description}</span>
                  </SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-body">No additional work recorded.</p>
      )}
      {locked ? (
        <p className="text-sm text-body">An invoice has been requested. Call the office to add more work.</p>
      ) : (
        <details>
          <summary className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-md border-2 border-navy font-semibold text-navy">Record additional work</summary>
          <Notice tone="warn">Always tell the customer the price and get their approval before doing extra work.</Notice>
          <ActionForm action={addAdditionalWorkAction} className="mt-3">
            <input type="hidden" name="appointmentId" value={jobId} />
            <label htmlFor="aw-desc" className={labelClass}>
              Description <span className="text-danger">*</span>
            </label>
            <input id="aw-desc" name="description" required maxLength={300} className={inputClass} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="aw-min" className={labelClass}>
                  Minutes
                </label>
                <input id="aw-min" name="minutes" type="number" min={0} max={1440} inputMode="numeric" defaultValue={30} className={inputClass} />
              </div>
              <div>
                <label htmlFor="aw-price" className={labelClass}>
                  Price ($) <span className="text-danger">*</span>
                </label>
                <input id="aw-price" name="price" required inputMode="decimal" placeholder="40.00" className={inputClass} />
              </div>
            </div>
            <label htmlFor="aw-by" className={`${labelClass} mt-3`}>
              Approved by (name) <span className="text-danger">*</span>
            </label>
            <input id="aw-by" name="approvedByName" required maxLength={120} className={inputClass} />
            <fieldset className="mt-3">
              <legend className={labelClass}>How did they approve?</legend>
              <div className="flex gap-4">
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="approvalMethod" value="VERBAL" defaultChecked className="h-5 w-5 accent-green" /> Verbally
                </label>
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="approvalMethod" value="SIGNATURE" className="h-5 w-5 accent-green" /> Signed
                </label>
              </div>
            </fieldset>
            <div className="mt-3 flex items-start gap-3">
              <input id="aw-ok" type="checkbox" name="customerApproved" required className="mt-1 h-6 w-6 shrink-0 accent-green" />
              <label htmlFor="aw-ok" className="font-semibold text-navy">
                The customer approved this cost before the work was done.
              </label>
            </div>
            <SubmitButton size="lg" className="mt-3 w-full">
              Add additional work
            </SubmitButton>
          </ActionForm>
        </details>
      )}
    </Section>
  );
}

function SignatureSection({ job, tz }: { job: TechJob; tz: string }) {
  const wo = job.workOrder;
  const defaultName = `${job.customer.firstName} ${job.customer.lastName}`;
  return (
    <Section id="sig-h" title="Customer signature">
      {wo?.signedAt ? (
        <div>
          {wo.signatureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wo.signatureDataUrl} alt={`Signature of ${wo.signedByName}`} className="w-full rounded-md border border-line bg-white" />
          ) : (
            <p className="rounded-md border border-line bg-soft p-3 font-heading text-2xl italic text-navy">{wo.signedByName}</p>
          )}
          <p className="mt-2 text-sm text-body">
            Signed by {wo.signedByName} on {formatDateTime(wo.signedAt, tz)}
            {!wo.signatureDataUrl && " (typed name)"}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold text-navy">Sign again</summary>
            <div className="mt-3">
              <SignaturePad action={saveSignatureAction} appointmentId={job.id} defaultName={wo.signedByName ?? defaultName} />
            </div>
          </details>
        </div>
      ) : (
        <SignaturePad action={saveSignatureAction} appointmentId={job.id} defaultName={defaultName} />
      )}
    </Section>
  );
}

function CompletionSection({ job, tz }: { job: TechJob; tz: string }) {
  const wo = job.workOrder;
  if (job.status === "COMPLETED") {
    return (
      <Section id="done-h" title="Job completed">
        <p>Completed {wo?.completedAt ? formatDateTime(wo.completedAt, tz) : ""}.</p>
        {wo?.invoiceRequestedAt ? (
          <p className="mt-2">
            <Badge tone="green">Invoice requested</Badge> <span className="text-sm text-body">{formatDateTime(wo.invoiceRequestedAt, tz)}</span>
          </p>
        ) : (
          <ActionForm action={requestInvoiceAction} className="mt-3">
            <input type="hidden" name="appointmentId" value={job.id} />
            <p className="mb-2 text-sm text-body">The office will prepare and send the invoice.</p>
            <SubmitButton size="lg" variant="secondary" className="w-full" pendingText="Requesting...">
              Request invoice
            </SubmitButton>
          </ActionForm>
        )}
      </Section>
    );
  }
  return (
    <Section id="done-h" title="Complete job">
      {job.status !== "IN_PROGRESS" ? (
        <p className="text-body">Mark the job &ldquo;In Progress&rdquo; when you start working. You can complete it from here afterwards.</p>
      ) : (
        <ActionForm action={completeJobAction}>
          <input type="hidden" name="appointmentId" value={job.id} />
          <label htmlFor="complete-summary" className={labelClass}>
            Visit summary for the customer
          </label>
          <p id="cs-hint" className="mb-1 text-sm text-body">
            This is emailed to the customer. Leave blank to send a simple thank-you.
          </p>
          <textarea id="complete-summary" name="resolutionSummary" rows={4} maxLength={4000} aria-describedby="cs-hint" defaultValue={wo?.resolutionSummary ?? ""} className={inputClass} />
          <p className="mt-2 text-sm text-body">Completing stops the timer and emails the customer a thank-you with this summary.</p>
          <SubmitButton size="lg" className="mt-3 w-full" pendingText="Completing..." confirm="Complete this job and email the customer?">
            Complete job
          </SubmitButton>
        </ActionForm>
      )}
    </Section>
  );
}

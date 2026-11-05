import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { portalAppointments } from "@/lib/portal/access";
import { canCustomerModify } from "@/lib/booking/status";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { AppointmentStatusBadge } from "@/components/status";
import { formatDate, formatTime } from "@/lib/time";
import { formatCents } from "@/lib/money";
import { PortalAppointmentControls } from "./PortalAppointmentControls";

export const metadata = { title: "My Appointments" };

export default async function PortalAppointments() {
  const user = await requirePermission("customer:portal", "/portal/appointments");
  const [appts, biz, cancellation] = await Promise.all([portalAppointments(user), getSettings("business"), getSettings("cancellation")]);
  const now = new Date();
  const upcoming = appts.filter((a) => a.startsAt >= now && !["CANCELED", "NO_SHOW", "COMPLETED"].includes(a.status)).reverse();
  const past = appts.filter((a) => !upcoming.includes(a));
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Appointments</h1>
        <ButtonLink href="/schedule">Request a new visit</ButtonLink>
      </div>
      <h2 className="mb-3 text-xl">Upcoming</h2>
      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming appointments" />
      ) : (
        <ul className="mb-8 space-y-4">
          {upcoming.map((a) => {
            const check = canCustomerModify({ status: a.status, startsAt: a.startsAt, now, freeCancellationHours: cancellation.freeCancellationHours });
            return (
              <li key={a.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg">
                      {formatDate(a.startsAt, biz.timeZone)} at {formatTime(a.startsAt, biz.timeZone)}
                    </h3>
                    <AppointmentStatusBadge status={a.status} />
                  </div>
                  <p className="mt-1">
                    {a.serviceName}
                    {!a.self && ` for ${a.customerName}`} · {a.location ?? ""} · Ref. {a.reference}
                  </p>
                  {a.estimatedTotalCents != null && <p className="text-sm">Estimate: {formatCents(a.estimatedTotalCents)}</p>}
                  {a.problemDescription && <p className="mt-1 text-sm">Your note: {a.problemDescription}</p>}
                  <div className="mt-3">
                    {a.canChange && check.allowed ? (
                      <PortalAppointmentControls appointmentId={a.id} serviceId={a.serviceId} timeZone={biz.timeZone} allowReschedule={cancellation.allowOnlineReschedule} extensionBlocks={a.extensionBlocks} />
                    ) : (
                      <p className="text-sm">{a.canChange ? check.reason : "Contact us if this appointment needs to change."}</p>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <h2 className="mb-3 text-xl">Past and canceled</h2>
      {past.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <ul className="space-y-3">
          {past.map((a) => (
            <li key={a.id} className="rounded-md border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{formatDate(a.startsAt, biz.timeZone)}</span>
                <span>
                  {a.serviceName}
                  {!a.self && ` for ${a.customerName}`}
                </span>
                <AppointmentStatusBadge status={a.status} />
              </div>
              {a.visitSummary && <p className="mt-1 text-sm">Visit summary: {a.visitSummary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

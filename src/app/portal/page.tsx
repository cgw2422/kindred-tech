import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { getPortalAccess, portalAppointments } from "@/lib/portal/access";
import { listInvoicesForUser } from "@/lib/payments/portal";
import { ButtonLink, Card, Notice } from "@/components/ui";
import { AppointmentStatusBadge } from "@/components/status";
import { formatDate, formatTime } from "@/lib/time";
import { formatCents } from "@/lib/money";

export const metadata = { title: "My Account" };

export default async function PortalHome() {
  const user = await requirePermission("customer:portal", "/portal");
  const [access, appts, invoices, biz] = await Promise.all([getPortalAccess(user), portalAppointments(user), listInvoicesForUser(user), getSettings("business")]);
  const upcoming = appts.filter((a) => a.startsAt > new Date() && !["CANCELED", "NO_SHOW", "COMPLETED"].includes(a.status)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const unpaid = invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIALLY_PAID");
  return (
    <div>
      <h1 className="mb-2 text-3xl">Welcome, {user.name.split(" ")[0]}</h1>
      <p className="mb-6 text-lg">Here is a summary of your appointments and billing.</p>
      {access.length === 0 && (
        <div className="mb-6">
          <Notice tone="warn">Your sign-in is not yet linked to a customer record. Please contact us and we will connect it.</Notice>
        </div>
      )}
      {access.some((a) => !a.self) && (
        <p className="mb-6">
          You are an authorized contact for: {access.filter((a) => !a.self).map((a) => a.name).join(", ")}. You can see only what they have permitted.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl">Upcoming appointments</h2>
          {upcoming.length === 0 ? (
            <p className="mb-4">No upcoming appointments.</p>
          ) : (
            <ul className="mb-4 space-y-3">
              {upcoming.slice(0, 5).map((a) => (
                <li key={a.id} className="rounded-md border border-line p-3">
                  <p className="font-semibold">
                    {formatDate(a.startsAt, biz.timeZone)} at {formatTime(a.startsAt, biz.timeZone)}
                  </p>
                  <p>
                    {a.serviceName} {!a.self && `for ${a.customerName}`}
                  </p>
                  <AppointmentStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/schedule">Schedule a visit</ButtonLink>
            <ButtonLink href="/portal/appointments" variant="outline">
              All appointments
            </ButtonLink>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-xl">Billing</h2>
          {unpaid.length === 0 ? (
            <p className="mb-4">You have no unpaid invoices.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {unpaid.map((i) => (
                <li key={i.id}>
                  Invoice {i.number}: <span className="font-semibold">{formatCents(i.balanceCents)}</span> due
                </li>
              ))}
            </ul>
          )}
          <ButtonLink href="/portal/billing" variant="outline">
            Billing & membership
          </ButtonLink>
        </Card>
      </div>
      <p className="mt-8">
        Want to sign in with a password instead of an email link? <Link href="/account/password">Set a password</Link>.
      </p>
    </div>
  );
}

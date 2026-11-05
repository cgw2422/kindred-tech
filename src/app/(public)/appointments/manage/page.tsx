import type { Metadata } from "next";
import { Card, Notice } from "@/components/ui";
import { AppointmentStatusBadge } from "@/components/status";
import { findAppointmentByManageToken } from "@/lib/booking/service";
import { canCustomerModify } from "@/lib/booking/status";
import { getSettings } from "@/lib/settings";
import { formatDate, formatTime } from "@/lib/time";
import { formatCents } from "@/lib/money";
import { ManageControls } from "./ManageControls";

export const metadata: Metadata = { title: "Your Appointment", robots: { index: false } };

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const appt = await findAppointmentByManageToken(token);
  const [biz, cancellation] = await Promise.all([getSettings("business"), getSettings("cancellation")]);
  if (!appt) {
    return (
      <div className="container-site max-w-2xl py-12">
        <h1 className="mb-3 text-3xl">Appointment not found</h1>
        <p>This link may be incomplete or out of date. Please use the link from your most recent email, sign in to your account, or contact us{biz.phone ? ` at ${biz.phone}` : ""}.</p>
      </div>
    );
  }
  const check = canCustomerModify({ status: appt.status, startsAt: appt.startsAt, now: new Date(), freeCancellationHours: cancellation.freeCancellationHours });
  return (
    <div className="container-site max-w-3xl py-12">
      <h1 className="mb-6 text-3xl">Your appointment</h1>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="font-mono text-lg font-bold">{appt.reference}</span>
          <AppointmentStatusBadge status={appt.status} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <dt className="font-semibold text-navy">Service</dt>
          <dd>{appt.service.name}</dd>
          <dt className="font-semibold text-navy">Date</dt>
          <dd>{formatDate(appt.startsAt, biz.timeZone)}</dd>
          <dt className="font-semibold text-navy">Time</dt>
          <dd>{formatTime(appt.startsAt, biz.timeZone)} (Eastern)</dd>
          <dt className="font-semibold text-navy">For</dt>
          <dd>
            {appt.customer.firstName} {appt.customer.lastName.charAt(0)}.
          </dd>
          {appt.address && (
            <>
              <dt className="font-semibold text-navy">Address</dt>
              <dd>
                {appt.address.line1}, {appt.address.city}
              </dd>
            </>
          )}
          {appt.estimatedTotalCents != null && (
            <>
              <dt className="font-semibold text-navy">Estimate</dt>
              <dd>{formatCents(appt.estimatedTotalCents)}</dd>
            </>
          )}
        </dl>
      </Card>
      <div className="mt-6">
        {check.allowed ? (
          <ManageControls token={token} serviceId={appt.serviceId} timeZone={biz.timeZone} allowReschedule={cancellation.allowOnlineReschedule} policy={cancellation.policyText} extensionBlocks={appt.extensionBlocks} />
        ) : (
          <Notice tone="navy">{check.reason}</Notice>
        )}
      </div>
    </div>
  );
}

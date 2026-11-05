import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice, buttonClass } from "@/components/ui";
import { findAppointmentByManageToken } from "@/lib/booking/service";
import { getSettings } from "@/lib/settings";
import { formatDate, formatTime } from "@/lib/time";
import { integrationStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Request Received", robots: { index: false } };

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const appt = sp.t ? await findAppointmentByManageToken(sp.t) : null;
  const biz = await getSettings("business");
  if (!appt) {
    return (
      <div className="container-site max-w-2xl py-12">
        <h1 className="mb-3 text-3xl">Thank you</h1>
        <p>We could not find that request. If you just submitted it, please check your email or contact us.</p>
      </div>
    );
  }
  const confirmed = appt.status === "CONFIRMED";
  return (
    <div className="container-site max-w-3xl py-12">
      <h1 className="mb-3 text-3xl md:text-4xl">{confirmed ? "Your appointment is confirmed" : "We received your request"}</h1>
      <p className="mb-6 text-lg">
        {confirmed
          ? "Thank you. We look forward to helping you."
          : "Thank you. We will review your request and contact you to confirm the details. Your time is being held for you in the meantime."}
      </p>
      {sp.a === "0" && (
        <div className="mb-6">
          <Notice tone="warn" title="Outside our usual service area">
            The address you entered is outside the area we normally serve. We will contact you to let you know whether we can help.
          </Notice>
        </div>
      )}
      <Card>
        <dl className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <dt className="font-semibold text-navy">Reference number</dt>
          <dd className="font-mono text-lg font-bold tracking-wider">{appt.reference}</dd>
          <dt className="font-semibold text-navy">Service</dt>
          <dd>{appt.service.name}</dd>
          <dt className="font-semibold text-navy">Date</dt>
          <dd>{formatDate(appt.startsAt, biz.timeZone)}</dd>
          <dt className="font-semibold text-navy">Time</dt>
          <dd>{formatTime(appt.startsAt, biz.timeZone)} (Eastern)</dd>
          {appt.address && (
            <>
              <dt className="font-semibold text-navy">Address</dt>
              <dd>
                {appt.address.line1}, {appt.address.city}
              </dd>
            </>
          )}
        </dl>
      </Card>
      <div className="mt-6 space-y-3">
        <p>
          {(appt.customer.email || appt.requesterEmail) && integrationStatus().email && integrationStatus().emailMode !== "disabled"
            ? "We have sent a copy of these details by email."
            : "Please write down your reference number."}{" "}
          Save the link below to view, reschedule, or cancel your appointment.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/appointments/manage?token=${encodeURIComponent(sp.t!)}`} className={buttonClass("secondary", "md")}>
            View or change this appointment
          </Link>
          <Link href="/" className={buttonClass("outline", "md")}>
            Back to home
          </Link>
        </div>
        {biz.phone && (
          <p>
            Questions? Call us at <a href={`tel:${biz.phone.replace(/[^\d+]/g, "")}`}>{biz.phone}</a>.
          </p>
        )}
      </div>
    </div>
  );
}

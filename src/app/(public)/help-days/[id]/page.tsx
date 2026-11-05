import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/time";
import { getPublicHelpDay } from "@/lib/facilities/help-days";
import { Notice } from "@/components/ui";
import { SignupForm, type SignupSlot } from "./SignupForm";

export const dynamic = "force-dynamic";

const NOINDEX = { index: false, follow: false } as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const day = await getPublicHelpDay(id).catch(() => null);
  return {
    title: day ? `Tech Help Day at ${day.facility.name}` : "Tech Help Day",
    robots: NOINDEX,
  };
}

export default async function HelpDaySignupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = new Date();
  const [day, biz] = await Promise.all([getPublicHelpDay(id, now), getSettings("business")]);
  if (!day) notFound();
  const tz = biz.timeZone;
  const priceNote =
    day.priceCents === 0
      ? `Free for residents. This Tech Help Day is provided by ${day.facility.name}.`
      : `Each ${day.slotMinutes}-minute session is ${formatCents(day.priceCents)}, payable to ${biz.name}.`;
  const slots: SignupSlot[] = day.slots.map((s) => ({ startsAt: s.startsAt.toISOString(), label: formatTime(s.startsAt, tz), available: s.available }));
  const isFuture = day.startsAt > now || day.slots.some((s) => s.available);

  return (
    <div className="container-site py-10">
      <p className="mb-1 text-lg font-semibold uppercase tracking-wider text-green">Tech Help Day</p>
      <h1 className="mb-3 text-3xl md:text-4xl">{day.facility.name}</h1>
      <div className="mb-6 rounded-lg border border-line bg-white p-5 text-lg">
        <p className="text-xl font-semibold text-navy">{formatDate(day.startsAt, tz)}</p>
        <p>
          {formatTime(day.startsAt, tz)} to {formatTime(day.endsAt, tz)}
        </p>
        <p>{[day.location, day.facility.line1, day.facility.city].filter(Boolean).join(" · ")}</p>
        <p className="mt-3">
          Sit down one-on-one with a friendly {biz.name} technician for help with your phone, tablet, computer, email, photos, or anything else that has you stuck. {priceNote}
        </p>
      </div>

      {!day.bookable || !isFuture ? (
        <Notice tone="neutral" title="Sign-ups are closed">
          {day.status === "CANCELED" ? "This Tech Help Day has been canceled." : "This Tech Help Day is no longer taking sign-ups."}{" "}
          {biz.phone ? `Questions? Call us at ${biz.phone}.` : "Please ask your community's front desk about upcoming dates."}
        </Notice>
      ) : (
        <div className="max-w-4xl">
          <SignupForm helpDayId={day.id} slots={slots} priceNote={priceNote} />
          {biz.phone && (
            <p className="mt-4 text-lg">
              Prefer to reserve by phone? Call{" "}
              <a href={`tel:${biz.phone.replace(/[^\d+]/g, "")}`} className="font-semibold">
                {biz.phone}
              </a>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}

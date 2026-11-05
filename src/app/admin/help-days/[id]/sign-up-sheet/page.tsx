import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/time";
import { LogoMark } from "@/components/brand/Logo";
import { residentPriceForHelpDay, slotGrid } from "@/lib/facilities/help-days";
import { PrintButton } from "@/app/facility/_components/PrintButton";

export const metadata: Metadata = { title: "Sign-up sheet" };

/**
 * Printable sheet to post in the community: session times with blank lines.
 * Booked sessions show only "Reserved" (no resident names), because the sheet
 * is displayed publicly.
 */
export default async function SignUpSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("facilities:view", `/admin/help-days/${id}/sign-up-sheet`);
  const day = await prisma.techHelpDay.findUnique({
    where: { id },
    include: {
      facility: { select: { name: true, residentRateCents: true } },
      appointments: { where: { status: { notIn: ["CANCELED", "NO_SHOW"] } }, select: { startsAt: true, endsAt: true } },
    },
  });
  if (!day) notFound();
  const biz = await getSettings("business");
  const tz = biz.timeZone;
  const grid = slotGrid(day, day.appointments.map((a) => ({ start: a.startsAt, end: a.endsAt })), new Date(0));
  const price = await residentPriceForHelpDay(day);

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 print:max-w-none print:p-0">
      <style>{`@media print { aside, header, .skip-link { display: none !important; } main { padding: 0 !important; } @page { margin: 0.6in; } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/admin/help-days/${day.id}`}>← Back to Tech Help Day</Link>
        <PrintButton />
      </div>
      <div className="mb-4 flex items-center gap-3 border-b-2 border-navy pb-3">
        <LogoMark size={44} />
        <div>
          <p className="font-heading text-2xl font-bold text-navy">Tech Help Day Sign-Up</p>
          <p className="text-lg">{day.facility.name}</p>
        </div>
      </div>
      <p className="text-xl font-semibold text-navy">{formatDate(day.startsAt, tz)}</p>
      <p className="text-lg">
        {formatTime(day.startsAt, tz)} to {formatTime(day.endsAt, tz)}
        {day.location ? ` · ${day.location}` : ""}
      </p>
      <p className="mt-1 mb-4">
        Each session is {day.slotMinutes} minutes, one-on-one with a {biz.name} technician.{" "}
        {price === 0 ? `Free for residents, courtesy of ${day.facility.name}.` : `${formatCents(price)} per session, paid to ${biz.name}.`} Bring your device, its charger, and any passwords you
        know.
      </p>
      <table className="w-full border-collapse text-left text-lg">
        <thead>
          <tr>
            <th className="w-28 border-2 border-navy px-2 py-2">Time</th>
            <th className="border-2 border-navy px-2 py-2">Name</th>
            <th className="w-24 border-2 border-navy px-2 py-2">Apt.</th>
            <th className="w-44 border-2 border-navy px-2 py-2">Phone</th>
          </tr>
        </thead>
        <tbody>
          {grid.map((s) => (
            <tr key={s.startsAt.toISOString()} className="h-14">
              <td className="border-2 border-navy px-2 font-semibold">{formatTime(s.startsAt, tz)}</td>
              {s.available ? (
                <>
                  <td className="border-2 border-navy" />
                  <td className="border-2 border-navy" />
                  <td className="border-2 border-navy" />
                </>
              ) : (
                <td colSpan={3} className="border-2 border-navy px-2 italic text-body">
                  Reserved
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-sm">
        You can also reserve a time online{biz.phone ? ` or by calling ${biz.phone}` : ""}. Please let the front desk know if you can no longer make your time.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/time";
import { requirePortalUser } from "@/lib/facilities/portal-session";
import { getPortalMaterials } from "@/lib/facilities/portal";
import { LogoMark } from "@/components/brand/Logo";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { PrintButton } from "../_components/PrintButton";
import { CopyText } from "../_components/CopyText";

export const metadata: Metadata = { title: "Flyers & newsletter" };

export default async function FacilityMaterialsPage() {
  const { user } = await requirePortalUser("/facility/materials");
  const [data, biz] = await Promise.all([getPortalMaterials(user.id), getSettings("business")]);
  const tz = biz.timeZone;
  const days = data.helpDays;
  const priceText = (cents: number | null) => (cents == null ? "" : cents === 0 ? `Free for residents, courtesy of ${data.facility.name}` : `${formatCents(cents)} per session`);
  const allFree = days.length > 0 && days.every((d) => d.priceCents === 0);
  const contactLine = [biz.phone ? `call ${biz.name} at ${biz.phone}` : null, biz.email ? `email ${biz.email}` : null].filter(Boolean).join(" or ");

  const dateLines = days.map((d) => `• ${formatDate(d.startsAt, tz)}, ${formatTime(d.startsAt, tz)} to ${formatTime(d.endsAt, tz)}${d.location ? `, ${d.location}` : ""}`);
  const blurb = days.length
    ? [
        `Tech Help Day with ${biz.name}`,
        "",
        `Questions about your phone, tablet, or computer? A friendly, patient technician from ${biz.name} is coming to ${data.facility.name} for one-on-one help with email, photos, video calls, passwords, scam safety, and anything else that has you stuck.`,
        "",
        ...dateLines,
        "",
        `Sessions are ${days[0].slotMinutes} minutes. ${allFree ? `Free for residents, courtesy of ${data.facility.name}.` : priceText(days[0].priceCents) + "."}`,
        `Reserve your time online at ${days[0].signupUrl}${days.length > 1 ? " (each date has its own sign-up page; ask the front desk for links to later dates)" : ""}, or ask the front desk to sign you up.`,
        contactLine ? `Questions? You can also ${contactLine}.` : "",
      ]
        .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
        .join("\n")
        .trim()
    : "";

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow="Community Portal"
          title="Flyers & newsletter"
          description="Help residents find out about upcoming Tech Help Days. Print the flyer below or copy the newsletter text."
          actions={days.length ? <PrintButton label="Print flyer" /> : undefined}
        />
      </div>
      {days.length === 0 ? (
        <EmptyState title="No upcoming Tech Help Days with open sign-ups">Materials appear here once a Tech Help Day is scheduled.</EmptyState>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[3fr_2fr] print:block">
          <article aria-label="Printable flyer" className="flyer rounded-lg border-2 border-navy bg-white p-8 print:border-0 print:p-0">
            <style>{`@media print { @page { margin: 0.5in; } .flyer { font-size: 15pt; } }`}</style>
            <div className="flex items-center gap-3">
              <LogoMark size={56} />
              <p className="font-heading text-xl font-bold text-navy">{biz.name}</p>
            </div>
            <h2 className="mt-6 text-4xl print:text-5xl">Tech Help Day</h2>
            <p className="mt-1 text-2xl text-green-dark">at {data.facility.name}</p>
            <p className="mt-6 text-xl leading-relaxed">
              Questions about your phone, tablet or computer? Sit down one-on-one with a friendly, patient technician for help with email, photos, video calls, passwords, scam safety, and more.
            </p>
            <ul className="mt-6 space-y-4">
              {days.map((d) => (
                <li key={d.id} className="rounded-md border-l-8 border-green bg-soft p-4 print:bg-white">
                  <p className="text-2xl font-bold text-navy">{formatDate(d.startsAt, tz)}</p>
                  <p className="text-xl">
                    {formatTime(d.startsAt, tz)} to {formatTime(d.endsAt, tz)}
                    {d.location ? ` · ${d.location}` : ""}
                  </p>
                  {d.priceCents != null && <p className="text-lg">{priceText(d.priceCents)}</p>}
                  <p className="mt-1 text-base break-all">Sign up: {d.signupUrl}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xl">
              <strong>Reserve your {days[0].slotMinutes}-minute session</strong> online, or ask the front desk to sign you up.
              {contactLine ? ` Questions? ${contactLine.charAt(0).toUpperCase()}${contactLine.slice(1)}.` : ""}
            </p>
            <p className="mt-4 text-lg">Bring your device, its charger, and any passwords you know.</p>
          </article>

          <div className="no-print space-y-6">
            <Card>
              <SectionTitle>Newsletter text</SectionTitle>
              <CopyText id="newsletter-blurb" label="Copy and paste into your newsletter or bulletin" text={blurb} rows={14} />
            </Card>
            <Card>
              <SectionTitle>Sign-up links</SectionTitle>
              <ul className="space-y-2">
                {days.map((d) => (
                  <li key={d.id}>
                    <span className="font-semibold text-navy">{formatDate(d.startsAt, tz, { weekday: "short", month: "short" })}</span>
                    <br />
                    <a href={d.signupUrl!} className="break-all" target="_blank" rel="noopener">
                      {d.signupUrl}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

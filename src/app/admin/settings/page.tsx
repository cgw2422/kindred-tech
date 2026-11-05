import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, Card, Checkbox, PageHeader, Table, Td, TextArea, TextInput, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { getAllSettings, type SettingsKey } from "@/lib/settings";
import { integrationStatus } from "@/lib/env";
import { centsToDollarString } from "@/lib/money";
import { minutesToTimeInput } from "@/lib/admin/common";
import { WEEKDAY_NAMES } from "@/lib/admin/technicians";
import { ActionForm } from "../_config/ActionForm";
import { SETTINGS_NAV, SubNav } from "../_config/nav";
import { saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS: { id: string; label: string }[] = [
  { id: "business", label: "Business info" },
  { id: "hours", label: "Business hours" },
  { id: "booking", label: "Booking rules" },
  { id: "cancellation", label: "Cancellation" },
  { id: "billing", label: "Billing" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy & retention" },
  { id: "integrations", label: "Integrations" },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card as="section" className="scroll-mt-6">
      <h2 id={id} className="mb-1 text-xl">
        {title}
      </h2>
      {description && <p className="mb-4 text-body">{description}</p>}
      {children}
    </Card>
  );
}

function SettingsForm({ section, children }: { section: SettingsKey; children: ReactNode }) {
  return (
    <ActionForm action={saveSettingsAction}>
      <input type="hidden" name="section" value={section} />
      {children}
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

export default async function SettingsPage() {
  await requirePermission("settings:manage", "/admin/settings");
  const s = await getAllSettings();
  const integ = integrationStatus();
  const integrations: { name: string; ok: boolean; status?: string; vars: string; note: string }[] = [
    { name: "Stripe payments", ok: integ.stripe, vars: "STRIPE_SECRET_KEY", note: "Online card payments and payment links." },
    { name: "Stripe webhooks", ok: integ.stripeWebhooks, vars: "STRIPE_WEBHOOK_SECRET (plus STRIPE_SECRET_KEY)", note: "Marks invoices paid automatically and syncs memberships." },
    {
      name: "Email",
      ok: integ.email,
      status: `Delivery mode: ${integ.emailMode}`,
      vars: "RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, EMAIL_DELIVERY_MODE (disabled | allowlist | live), EMAIL_ALLOWLIST",
      note:
        integ.emailMode === "live"
          ? "Emails are delivered to all recipients."
          : integ.emailMode === "allowlist"
            ? "Emails are only delivered to addresses on EMAIL_ALLOWLIST."
            : "Emails are recorded in the communication log but not delivered.",
    },
    {
      name: "Maps & routing",
      ok: integ.maps !== "none",
      status: integ.maps === "none" ? undefined : `Provider: ${integ.maps === "google" ? "Google Maps" : "Mapbox"}`,
      vars: "GOOGLE_MAPS_API_KEY or MAPBOX_ACCESS_TOKEN",
      note: "Address geocoding and drive-time route planning. Without it, routes use straight-line estimates.",
    },
    { name: "File storage (S3)", ok: integ.storage, vars: "S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_ENDPOINT", note: "Uploads such as photos and signed documents." },
    { name: "Text messages (SMS)", ok: integ.sms, status: "Not implemented yet", vars: "—", note: "Text reminders are not available in this version." },
  ];

  return (
    <div>
      <PageHeader title="Settings" description="Business details, scheduling rules and policies. Changes take effect immediately." />
      <SubNav items={SETTINGS_NAV} current="/admin/settings" label="Settings sections" />
      <nav aria-label="Jump to section" className="mb-6 flex flex-wrap gap-2">
        {SECTIONS.map((x) => (
          <a key={x.id} href={`#${x.id}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold no-underline hover:border-navy">
            {x.label}
          </a>
        ))}
        <Link href="/admin/settings/closures" className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold no-underline hover:border-navy">
          Holidays &amp; closures →
        </Link>
      </nav>

      <div className="grid max-w-4xl gap-6">
        <Section id="business" title="Business information" description="Shown on the website, emails and invoices.">
          <SettingsForm section="business">
            <div className="grid gap-x-6 md:grid-cols-2">
              <TextInput label="Business name" name="name" required defaultValue={s.business.name} />
              <TextInput label="Logo URL" name="logoUrl" defaultValue={s.business.logoUrl} hint="https:// address or a path like /logo.png. Blank uses the built-in logo." />
              <TextInput label="Tagline" name="tagline" defaultValue={s.business.tagline} />
              <TextInput label="Secondary tagline" name="secondaryTagline" defaultValue={s.business.secondaryTagline} />
              <TextInput label="Phone" name="phone" type="tel" defaultValue={s.business.phone} />
              <TextInput label="Email" name="email" type="email" defaultValue={s.business.email} />
              <TextInput label="Street address" name="addressLine" defaultValue={s.business.addressLine} />
              <TextInput label="City" name="city" defaultValue={s.business.city} />
              <TextInput label="State" name="state" maxLength={2} defaultValue={s.business.state} />
              <TextInput label="ZIP code" name="postalCode" defaultValue={s.business.postalCode} />
              <TextInput label="Time zone" name="timeZone" required defaultValue={s.business.timeZone} hint="IANA name, e.g. America/New_York." />
            </div>
            <Checkbox name="showAddressPublicly" label="Show the street address on the website" defaultChecked={s.business.showAddressPublicly} />
            <TextArea label="Hours description" name="hoursDescription" rows={2} defaultValue={s.business.hoursDescription} hint="Plain-language hours shown on the website." />
            <fieldset className="mt-6 rounded-md border border-line p-4">
              <legend className="px-1 font-semibold text-navy">About page: Meet the owner (optional)</legend>
              <p className="mb-3">Shown on the About page when filled in. Add the photo under Website &gt; Page Images &gt; About: Owner photograph.</p>
              <div className="grid gap-x-6 md:grid-cols-2">
                <TextInput label="Owner name" name="ownerName" defaultValue={s.business.ownerName} />
                <TextInput label="Owner title" name="ownerTitle" defaultValue={s.business.ownerTitle} hint="For example, Owner and Technician" />
              </div>
              <TextArea label="Owner introduction" name="ownerBio" rows={5} defaultValue={s.business.ownerBio} hint="A few sentences in your own words. Leave a blank line between paragraphs." />
            </fieldset>
          </SettingsForm>
        </Section>

        <Section id="hours" title="Business hours" description="When appointments can be booked. Technicians' own schedules further limit availability.">
          <SettingsForm section="hours">
            <div className="mb-4 space-y-2">
              {WEEKDAY_NAMES.map((day, d) => {
                const h = s.hours.days[d];
                return (
                  <div key={day} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
                    <div className="w-36">
                      <Checkbox name={`d${d}_open`} label={day} defaultChecked={h.open} hint="Open" />
                    </div>
                    <label className="sr-only" htmlFor={`d${d}_start`}>
                      {day} opening time
                    </label>
                    <input id={`d${d}_start`} name={`d${d}_start`} type="time" step={900} defaultValue={minutesToTimeInput(h.startMinute)} className="rounded-md border-2 border-line px-2 py-1.5" />
                    <span aria-hidden>to</span>
                    <label className="sr-only" htmlFor={`d${d}_end`}>
                      {day} closing time
                    </label>
                    <input id={`d${d}_end`} name={`d${d}_end`} type="time" step={900} defaultValue={minutesToTimeInput(h.endMinute)} className="rounded-md border-2 border-line px-2 py-1.5" />
                  </div>
                );
              })}
            </div>
          </SettingsForm>
        </Section>

        <Section id="booking" title="Booking rules">
          <SettingsForm section="booking">
            <div className="grid gap-x-6 md:grid-cols-2">
              <TextInput label="Minimum notice (hours)" name="minNoticeHours" type="number" required min={0} defaultValue={s.booking.minNoticeHours} hint="How far ahead customers must book online." />
              <TextInput label="Maximum days ahead" name="maxDaysAhead" type="number" required min={1} max={365} defaultValue={s.booking.maxDaysAhead} />
              <TextInput label="Slot interval (minutes)" name="slotIntervalMinutes" type="number" required min={5} step={5} defaultValue={s.booking.slotIntervalMinutes} hint="Spacing between offered start times." />
              <TextInput label="Travel buffer (minutes)" name="travelBufferMinutes" type="number" required min={0} defaultValue={s.booking.travelBufferMinutes} hint="Kept free after in-home visits." />
              <TextInput label="Remote buffer (minutes)" name="remoteBufferMinutes" type="number" required min={0} defaultValue={s.booking.remoteBufferMinutes} />
            </div>
            <Checkbox name="requireApprovalByDefault" label="Require staff approval for online bookings by default" defaultChecked={s.booking.requireApprovalByDefault} />
            <Checkbox name="allowOutOfAreaRequests" label="Allow requests from outside the service area (flagged for review)" defaultChecked={s.booking.allowOutOfAreaRequests} />
          </SettingsForm>
        </Section>

        <Section id="cancellation" title="Cancellation policy">
          <SettingsForm section="cancellation">
            <div className="grid gap-x-6 md:grid-cols-2">
              <TextInput label="Free cancellation window (hours)" name="freeCancellationHours" type="number" required min={0} defaultValue={s.cancellation.freeCancellationHours} />
              <TextInput label="Late cancellation fee ($)" name="lateCancellationFeeCents" required inputMode="decimal" defaultValue={centsToDollarString(s.cancellation.lateCancellationFeeCents)} hint="Enter 0 for no fee." />
            </div>
            <Checkbox name="allowOnlineReschedule" label="Let customers reschedule or cancel online" defaultChecked={s.cancellation.allowOnlineReschedule} />
            <TextArea label="Policy text" name="policyText" rows={4} defaultValue={s.cancellation.policyText} hint="Shown when booking and in confirmation emails." />
          </SettingsForm>
        </Section>

        <Section id="billing" title="Billing">
          <SettingsForm section="billing">
            <div className="grid gap-x-6 md:grid-cols-2">
              <TextInput label="Invoice due (days)" name="invoiceDueDays" type="number" required min={0} max={120} defaultValue={s.billing.invoiceDueDays} />
              <TextInput label="Tax rate (%)" name="taxRatePercent" required inputMode="decimal" defaultValue={s.billing.taxRatePercent} hint="0 to 25. Use 0 if services are not taxed." />
              <TextInput label="Default travel fee ($)" name="defaultTravelFeeCents" required inputMode="decimal" defaultValue={centsToDollarString(s.billing.defaultTravelFeeCents)} hint="Used when an address is not in a service area." />
              <TextInput label="Deposit (%)" name="depositPercent" type="number" required min={0} max={100} defaultValue={s.billing.depositPercent} hint="0 for no deposit." />
            </div>
          </SettingsForm>
        </Section>

        <Section id="notifications" title="Notifications">
          <SettingsForm section="notifications">
            <TextInput label="Admin notification email" name="adminNotificationEmail" type="email" defaultValue={s.notifications.adminNotificationEmail} hint="Where new booking alerts are sent." />
            <Checkbox name="sendBookingReceived" label="Email customers when a booking request is received" defaultChecked={s.notifications.sendBookingReceived} />
            <Checkbox name="sendReminders" label="Send appointment reminders" defaultChecked={s.notifications.sendReminders} />
            <TextInput label="Reminder hours before" name="reminderHoursBefore" type="number" required min={1} max={168} defaultValue={s.notifications.reminderHoursBefore} />
            <Checkbox name="sendReviewRequests" label="Ask for a review after completed visits" defaultChecked={s.notifications.sendReviewRequests} />
            <TextInput label="Review URL" name="reviewUrl" type="url" defaultValue={s.notifications.reviewUrl} hint="For example your Google review link." />
          </SettingsForm>
        </Section>

        <Section id="privacy" title="Privacy and data retention" description="How long records are kept before automatic cleanup.">
          <SettingsForm section="privacy">
            <div className="grid gap-x-6 md:grid-cols-3">
              <TextInput label="Communication log (days)" name="communicationRetentionDays" type="number" required min={30} max={3650} defaultValue={s.privacy.communicationRetentionDays} hint="30 to 3650" />
              <TextInput label="Audit log (days)" name="auditRetentionDays" type="number" required min={90} max={3650} defaultValue={s.privacy.auditRetentionDays} hint="90 to 3650" />
              <TextInput label="Background jobs (days)" name="jobRetentionDays" type="number" required min={7} max={365} defaultValue={s.privacy.jobRetentionDays} hint="7 to 365" />
            </div>
          </SettingsForm>
        </Section>

        <Section id="integrations" title="Integrations" description="Connected services are configured with environment variables on the server. Secret values are never shown here.">
          <Table caption="Integration status">
            <thead>
              <tr>
                <Th>Service</Th>
                <Th>Status</Th>
                <Th>Environment variables</Th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.name}>
                  <Td>
                    <span className="font-semibold">{i.name}</span>
                    <div className="text-sm text-body">{i.note}</div>
                  </Td>
                  <Td>
                    <Badge tone={i.ok ? "green" : "warn"}>{i.ok ? "Configured" : "Not configured"}</Badge>
                    {i.status && <div className="mt-1 text-sm text-body">{i.status}</div>}
                  </Td>
                  <Td className="text-sm">
                    <code className="break-words">{i.vars}</code>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </div>
    </div>
  );
}

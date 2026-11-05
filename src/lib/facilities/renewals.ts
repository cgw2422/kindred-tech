/**
 * Contract renewal reminders. Registered as the "facility.renewal-reminders"
 * job handler; the scheduler enqueues it (e.g. daily). Each ACTIVE agreement
 * gets one reminder per renewal date (per recipient), enforced by the email
 * idempotency key, so the job is safe to run as often as needed.
 */
import { prisma } from "../db";
import { getSettings } from "../settings";
import { queueTemplatedEmail } from "../email/send";
import { registerJobHandler } from "../jobs/queue";
import { formatDate } from "../time";

export const RENEWAL_REMINDER_DAYS = 30;

export function renewalRecipients(
  facility: { email: string | null; name: string },
  contacts: { name: string; email: string | null; role: string }[],
): { email: string; name: string }[] {
  const withEmail = contacts.filter((c) => c.email);
  const preferred = withEmail.filter((c) => c.role === "PRIMARY" || c.role === "EXECUTIVE_DIRECTOR" || c.role === "BILLING");
  const list = (preferred.length ? preferred : withEmail).map((c) => ({ email: c.email!.toLowerCase(), name: c.name.split(" ")[0] }));
  if (list.length === 0 && facility.email) list.push({ email: facility.email.toLowerCase(), name: facility.name });
  const seen = new Set<string>();
  return list.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)));
}

export async function queueRenewalReminders(now = new Date()) {
  const until = new Date(now.getTime() + RENEWAL_REMINDER_DAYS * 86400_000);
  const agreements = await prisma.facilityAgreement.findMany({
    where: { status: "ACTIVE", renewalDate: { gte: now, lte: until } },
    include: { facility: { include: { contacts: true } } },
  });
  const biz = await getSettings("business");
  let queued = 0;
  for (const a of agreements) {
    const renewalKey = a.renewalDate!.toISOString().slice(0, 10);
    for (const r of renewalRecipients(a.facility, a.facility.contacts)) {
      const res = await queueTemplatedEmail({
        templateKey: "facility_contract_renewal",
        to: r.email,
        facilityId: a.facilityId,
        vars: { contactName: r.name, facilityName: a.facility.name, renewalDate: formatDate(a.renewalDate!, biz.timeZone, { weekday: undefined }) },
        idempotencyKey: `facility-renewal:${a.id}:${renewalKey}:${r.email}`,
        relatedType: "FacilityAgreement",
        relatedId: a.id,
      });
      if (res.queued) queued++;
    }
  }
  return { agreements: agreements.length, queued };
}

registerJobHandler("facility.renewal-reminders", async () => {
  await queueRenewalReminders();
});

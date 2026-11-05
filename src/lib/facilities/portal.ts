/**
 * Facility portal data access.
 *
 * PRIVACY RULE: facility contacts may see their own facility's schedule,
 * agreements, invoices (when canViewInvoices) and AGGREGATE usage only. They
 * must never see individual resident names, contact details, devices, problem
 * descriptions or notes. Every function here:
 *   1. resolves the facility from FacilityContact where userId = the signed-in
 *      user AND portalAccess = true, and
 *   2. filters every query by that facilityId and selects only safe fields.
 * Do not add `include: { appointments | residents | customer }` here.
 */
import { prisma } from "../db";
import { audit } from "../audit";
import { regeneratePayToken, sendInvoiceEmail, invoiceRecipient } from "../billing/invoices";
import { FacilityError } from "./errors";
import { helpDaySignupUrl, residentPriceForHelpDay, slotGrid } from "./help-days";
import { getFacilityUsage } from "./usage";

export type PortalContext = {
  contact: { id: string; name: string; title: string | null; role: string; canViewInvoices: boolean; canRequestSessions: boolean };
  facility: { id: string; name: string; city: string | null; state: string; type: string; partnershipModel: string | null };
};

export async function getPortalContext(userId: string): Promise<PortalContext | null> {
  const contact = await prisma.facilityContact.findFirst({
    where: { userId, portalAccess: true, user: { isActive: true, role: "FACILITY_CONTACT" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      title: true,
      role: true,
      canViewInvoices: true,
      canRequestSessions: true,
      facility: { select: { id: true, name: true, city: true, state: true, type: true, partnershipModel: true } },
    },
  });
  if (!contact) return null;
  const { facility, ...c } = contact;
  return { contact: c, facility };
}

async function requireContext(userId: string): Promise<PortalContext> {
  const ctx = await getPortalContext(userId);
  if (!ctx) throw new FacilityError("Your account does not have access to a community portal.", "FORBIDDEN");
  return ctx;
}

export type PortalHelpDay = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  status: string;
  paymentModel: string;
  slotMinutes: number;
  totalSlots: number;
  bookedSlots: number;
  openSlots: number;
  signupUrl: string | null;
};

async function helpDaysFor(facilityId: string, range: "upcoming" | "past", now: Date, take = 50): Promise<PortalHelpDay[]> {
  const days = await prisma.techHelpDay.findMany({
    where: { facilityId, ...(range === "upcoming" ? { endsAt: { gte: now } } : { endsAt: { lt: now } }) },
    orderBy: { startsAt: range === "upcoming" ? "asc" : "desc" },
    take,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      location: true,
      status: true,
      paymentModel: true,
      slotMinutes: true,
      slotBufferMinutes: true,
      _count: { select: { appointments: { where: { status: { notIn: ["CANCELED", "NO_SHOW"] } } } } },
    },
  });
  return days.map((d) => {
    const total = slotGrid(d, [], new Date(0)).length;
    const booked = d._count.appointments;
    const open = d.status === "SCHEDULED" || d.status === "CONFIRMED";
    return {
      id: d.id,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      location: d.location,
      status: d.status,
      paymentModel: d.paymentModel,
      slotMinutes: d.slotMinutes,
      totalSlots: total,
      bookedSlots: booked,
      openSlots: Math.max(0, total - booked),
      signupUrl: open && d.startsAt > now ? helpDaySignupUrl(d.id) : null,
    };
  });
}

export async function getPortalDashboard(userId: string, now = new Date()) {
  const ctx = await requireContext(userId);
  const [upcoming, usage, openRequests] = await Promise.all([
    helpDaysFor(ctx.facility.id, "upcoming", now, 5),
    getFacilityUsage(ctx.facility.id, { months: 6, now }),
    prisma.facilitySessionRequest.count({ where: { facilityId: ctx.facility.id, status: "OPEN" } }),
  ]);
  return { ...ctx, upcoming: upcoming.filter((d) => d.status !== "CANCELED"), usage, openRequests };
}

export async function listPortalHelpDays(userId: string, now = new Date()) {
  const ctx = await requireContext(userId);
  const [upcoming, past] = await Promise.all([helpDaysFor(ctx.facility.id, "upcoming", now), helpDaysFor(ctx.facility.id, "past", now, 24)]);
  return { ...ctx, upcoming, past };
}

export async function getPortalUsage(userId: string, now = new Date()) {
  const ctx = await requireContext(userId);
  return { ...ctx, usage: await getFacilityUsage(ctx.facility.id, { months: 12, now }) };
}

export async function listPortalAgreements(userId: string) {
  const ctx = await requireContext(userId);
  const agreements = await prisma.facilityAgreement.findMany({
    where: { facilityId: ctx.facility.id, status: { not: "DRAFT" } },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    select: {
      id: true,
      model: true,
      status: true,
      startDate: true,
      endDate: true,
      renewalDate: true,
      autoRenew: true,
      monthlyFeeCents: true,
      sessionRateCents: true,
      residentRateCents: true,
      hoursPerMonth: true,
      terms: true,
      signedAt: true,
    },
  });
  return { ...ctx, agreements };
}

function assertInvoices(ctx: PortalContext) {
  if (!ctx.contact.canViewInvoices) throw new FacilityError("Your account does not have access to invoices. Please contact us.", "FORBIDDEN");
}

export async function listPortalInvoices(userId: string) {
  const ctx = await requireContext(userId);
  assertInvoices(ctx);
  const invoices = await prisma.invoice.findMany({
    where: { facilityId: ctx.facility.id, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      status: true,
      issuedAt: true,
      dueAt: true,
      totalCents: true,
      amountPaidCents: true,
      amountRefundedCents: true,
      // Facility invoices describe Tech Help Days / contract months, never residents.
      lines: { orderBy: { sortOrder: "asc" }, select: { description: true, quantity: true, amountCents: true } },
    },
  });
  return { ...ctx, invoices };
}

/** "Email me a payment link": issues a fresh pay token and emails it to the facility's billing recipient. */
export async function requestPortalPayLink(userId: string, invoiceId: string) {
  const ctx = await requireContext(userId);
  assertInvoices(ctx);
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, facilityId: ctx.facility.id },
    include: { facility: { include: { contacts: true } } },
  });
  if (!inv) throw new FacilityError("Invoice not found.", "NOT_FOUND");
  if (inv.status !== "OPEN" && inv.status !== "PARTIALLY_PAID") throw new FacilityError("This invoice does not have a balance due.", "INVALID_STATUS");
  const recipient = await invoiceRecipient(inv);
  if (!recipient.email) throw new FacilityError("We do not have a billing email on file. Please contact us.", "NO_EMAIL");
  const { token } = await regeneratePayToken(inv.id);
  await sendInvoiceEmail(inv.id, token);
  await audit({ actorUserId: userId, action: "facility.portal_pay_link", entityType: "Invoice", entityId: inv.id, metadata: { facilityId: ctx.facility.id } });
  return { sentTo: recipient.email };
}

export async function createPortalSessionRequest(userId: string, input: { preferredDates: string; notes?: string | null }) {
  const ctx = await requireContext(userId);
  if (!ctx.contact.canRequestSessions) throw new FacilityError("Your account cannot request sessions. Please contact us.", "FORBIDDEN");
  const preferredDates = input.preferredDates.trim().slice(0, 1000);
  if (preferredDates.length < 3) throw new FacilityError("Please describe the dates or times you would like.", "VALIDATION");
  const req = await prisma.facilitySessionRequest.create({
    data: { facilityId: ctx.facility.id, requestedByName: ctx.contact.name, preferredDates, notes: input.notes?.trim().slice(0, 4000) || null },
    select: { id: true, preferredDates: true, notes: true, status: true, createdAt: true },
  });
  await audit({ actorUserId: userId, action: "facility.session_requested", entityType: "FacilitySessionRequest", entityId: req.id, metadata: { facilityId: ctx.facility.id } });
  return req;
}

export async function listPortalSessionRequests(userId: string) {
  const ctx = await requireContext(userId);
  const requests = await prisma.facilitySessionRequest.findMany({
    where: { facilityId: ctx.facility.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, requestedByName: true, preferredDates: true, notes: true, status: true, createdAt: true },
  });
  return { ...ctx, requests };
}

/** Upcoming open help days with sign-up links, for flyers and newsletter blurbs. */
export async function getPortalMaterials(userId: string, now = new Date()) {
  const ctx = await requireContext(userId);
  const days = (await helpDaysFor(ctx.facility.id, "upcoming", now, 12)).filter((d) => d.signupUrl);
  // Resident price per day (a public figure, shown on the flyer).
  const pricing = await prisma.techHelpDay.findMany({
    where: { id: { in: days.map((d) => d.id) }, facilityId: ctx.facility.id },
    select: { id: true, paymentModel: true, residentPriceCents: true, facility: { select: { residentRateCents: true } } },
  });
  const prices = new Map<string, number>();
  for (const p of pricing) prices.set(p.id, await residentPriceForHelpDay(p));
  return { ...ctx, helpDays: days.map((d) => ({ ...d, priceCents: prices.get(d.id) ?? null })) };
}

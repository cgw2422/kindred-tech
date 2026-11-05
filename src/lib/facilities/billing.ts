/**
 * Facility billing: sponsored Tech Help Day invoices and monthly contract
 * invoices. Both are idempotent so staff (or a scheduled job) can safely retry.
 */
import { prisma } from "../db";
import { audit } from "../audit";
import { getSettings } from "../settings";
import { createInvoice } from "../billing/invoices";
import { formatDate, formatTime, parseDateKey } from "../time";
import { FacilityError } from "./errors";

const SPONSORED_SERVICE_SLUG = "senior-living-tech-help-day";

/** Marker stored in invoice notes so a contract month is billed only once. */
export function contractInvoiceMarker(agreementId: string, monthKey: string) {
  return `[contract:${agreementId}:${monthKey}]`;
}

export function monthLabel(monthKey: string): string {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}

/**
 * Creates a DRAFT invoice to the facility for a FACILITY_SPONSORED help day,
 * priced at the day's sponsoredPriceCents, else the active agreement's
 * sessionRateCents. Returns the existing (non-void) invoice if there is one.
 */
export async function createSponsoredHelpDayInvoice(helpDayId: string, actorUserId?: string | null) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"helpday-invoice:" + helpDayId}))`;
    const day = await tx.techHelpDay.findUnique({ where: { id: helpDayId }, include: { facility: true } });
    if (!day) throw new FacilityError("Tech Help Day not found.", "NOT_FOUND");
    if (day.paymentModel !== "FACILITY_SPONSORED") throw new FacilityError("Only facility-sponsored Tech Help Days are invoiced to the facility.", "NOT_SPONSORED");
    if (day.status === "CANCELED") throw new FacilityError("This Tech Help Day was canceled.", "INVALID_STATUS");
    const existing = await tx.invoice.findFirst({ where: { techHelpDayId: helpDayId, facilityId: day.facilityId, status: { not: "VOID" } }, include: { lines: true } });
    if (existing) return { invoice: existing, created: false };

    const agreement = await tx.facilityAgreement.findFirst({ where: { facilityId: day.facilityId, status: "ACTIVE" }, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }] });
    const amount = day.sponsoredPriceCents ?? agreement?.sessionRateCents ?? null;
    if (amount == null) throw new FacilityError("Set a sponsored price on this Tech Help Day or a session rate on the facility's active agreement first.", "NO_PRICE");

    const biz = await getSettings("business");
    const service = await tx.service.findUnique({ where: { slug: SPONSORED_SERVICE_SLUG } });
    const sessions = await tx.appointment.count({ where: { techHelpDayId: helpDayId, status: { notIn: ["CANCELED", "NO_SHOW"] } } });
    const invoice = await createInvoice({
      tx,
      facilityId: day.facilityId,
      techHelpDayId: helpDayId,
      lines: [
        {
          description: `Tech Help Day at ${day.facility.name}: ${formatDate(day.startsAt, biz.timeZone)}, ${formatTime(day.startsAt, biz.timeZone)} to ${formatTime(day.endsAt, biz.timeZone)}`,
          unitPriceCents: amount,
          serviceId: service?.id ?? null,
          kind: "SERVICE",
        },
      ],
      notes: `Facility-sponsored Tech Help Day. Resident sessions booked: ${sessions}.`,
    });
    return { invoice, created: true };
  });
  if (result.created) {
    await audit({ actorUserId, action: "facility.sponsored_invoice_created", entityType: "Invoice", entityId: result.invoice.id, metadata: { helpDayId } });
  }
  return result;
}

/**
 * Creates the monthly invoice for a RECURRING_CONTRACT agreement (monthKey
 * "YYYY-MM"). Idempotent per agreement and month: a second call returns the
 * existing non-void invoice.
 */
export async function createMonthlyContractInvoice(agreementId: string, monthKey: string, actorUserId?: string | null) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new FacilityError("Month must look like 2026-11.", "VALIDATION");
  const marker = contractInvoiceMarker(agreementId, monthKey);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"contract-invoice:" + agreementId + ":" + monthKey}))`;
    const agreement = await tx.facilityAgreement.findUnique({ where: { id: agreementId }, include: { facility: true } });
    if (!agreement) throw new FacilityError("Agreement not found.", "NOT_FOUND");
    const existing = await tx.invoice.findFirst({
      where: { facilityId: agreement.facilityId, status: { not: "VOID" }, notes: { contains: marker } },
      include: { lines: true },
    });
    if (existing) return { invoice: existing, created: false };
    if (agreement.status !== "ACTIVE") throw new FacilityError("Only active agreements can be invoiced.", "INVALID_STATUS");
    if (!agreement.monthlyFeeCents) throw new FacilityError("This agreement has no monthly fee.", "NO_PRICE");

    const label = monthLabel(monthKey);
    const hours = agreement.hoursPerMonth ? ` (up to ${agreement.hoursPerMonth} hours of on-site support)` : "";
    const invoice = await createInvoice({
      tx,
      facilityId: agreement.facilityId,
      lines: [{ description: `Monthly partnership fee, ${label}${hours}`, unitPriceCents: agreement.monthlyFeeCents, kind: "SERVICE" }],
      notes: `Monthly contract invoice for ${agreement.facility.name}, ${label}. ${marker}`,
    });
    return { invoice, created: true };
  });
  if (result.created) {
    await audit({ actorUserId, action: "facility.contract_invoice_created", entityType: "Invoice", entityId: result.invoice.id, metadata: { agreementId, monthKey } });
  }
  return result;
}

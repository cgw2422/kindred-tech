import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { createInvoice, invoiceLinesFromEstimate, type NewInvoiceLine } from "../billing/invoices";
import { TechError } from "./access";

/** Admin (staff) work-order queries. Callers must check appointments:view / appointments:manage. */

export const WORK_ORDER_FILTERS = ["all", "open", "in_progress", "completed", "invoice_requested"] as const;
export type WorkOrderFilter = (typeof WORK_ORDER_FILTERS)[number];

export function parseWorkOrderFilter(v: string | undefined | null): WorkOrderFilter {
  return (WORK_ORDER_FILTERS as readonly string[]).includes(v ?? "") ? (v as WorkOrderFilter) : "all";
}

function filterWhere(filter: WorkOrderFilter): Prisma.WorkOrderWhereInput {
  switch (filter) {
    case "open":
      return { status: "OPEN" };
    case "in_progress":
      return { status: "IN_PROGRESS" };
    case "completed":
      return { status: "COMPLETED" };
    case "invoice_requested":
      return { invoiceRequestedAt: { not: null }, appointment: { invoices: { none: { status: { not: "VOID" } } } } };
    default:
      return {};
  }
}

export async function listWorkOrders(filter: WorkOrderFilter, take = 200) {
  return prisma.workOrder.findMany({
    where: filterWhere(filter),
    orderBy: [{ appointment: { startsAt: "desc" } }],
    take,
    select: {
      id: true,
      status: true,
      invoiceRequestedAt: true,
      completedAt: true,
      signedAt: true,
      technician: { select: { displayName: true } },
      timeEntries: { select: { startedAt: true, endedAt: true } },
      appointment: {
        select: {
          id: true,
          reference: true,
          status: true,
          startsAt: true,
          service: { select: { name: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
          invoices: { where: { status: { not: "VOID" } }, select: { id: true, number: true } },
        },
      },
    },
  });
}

export async function getWorkOrderDetail(id: string) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: {
      technician: { select: { displayName: true } },
      timeEntries: { orderBy: { startedAt: "asc" } },
      additionalWork: { orderBy: { approvedAt: "asc" } },
      subscriptionReview: { include: { items: { orderBy: { createdAt: "asc" } } } },
      appointment: {
        include: {
          service: { select: { id: true, name: true, basePriceCents: true } },
          customer: { select: { id: true, firstName: true, lastName: true, preferredName: true, phone: true, email: true } },
          address: true,
          invoices: { where: { status: { not: "VOID" } }, select: { id: true, number: true, status: true, totalCents: true } },
        },
      },
    },
  });
}

/** Invoice lines: the booking estimate (minus tax, which createInvoice recomputes) plus approved additional work. */
export function buildWorkOrderInvoiceLines(params: {
  estimateBreakdown: Prisma.JsonValue | null;
  service: { id: string; name: string; basePriceCents: number };
  additionalWork: { description: string; priceCents: number; minutes: number }[];
}): NewInvoiceLine[] {
  let lines = invoiceLinesFromEstimate(params.estimateBreakdown).map((l) => (l.kind === "SERVICE" ? { ...l, serviceId: params.service.id } : l));
  if (lines.length === 0) lines = [{ description: params.service.name, unitPriceCents: params.service.basePriceCents, serviceId: params.service.id, kind: "SERVICE" }];
  for (const w of params.additionalWork) {
    lines.push({
      description: `Additional work: ${w.description}${w.minutes ? ` (${w.minutes} min)` : ""}`,
      unitPriceCents: w.priceCents,
      kind: "ADDITIONAL_WORK",
    });
  }
  return lines;
}

/** Creates a DRAFT invoice for a work order. Refuses if a non-void invoice already exists for the appointment. */
export async function createInvoiceForWorkOrder(workOrderId: string, actorUserId: string) {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      additionalWork: { orderBy: { approvedAt: "asc" } },
      appointment: {
        include: {
          service: { select: { id: true, name: true, basePriceCents: true } },
          invoices: { where: { status: { not: "VOID" } }, select: { id: true } },
          customer: { select: { id: true, familyContacts: { where: { isBillingContact: true, canPay: true }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 } } },
        },
      },
    },
  });
  if (!wo) throw new TechError("Work order not found.", "NOT_FOUND");
  if (wo.appointment.invoices.length > 0) throw new TechError("An invoice already exists for this appointment.", "CONFLICT");
  const lines = buildWorkOrderInvoiceLines({ estimateBreakdown: wo.appointment.estimateBreakdown, service: wo.appointment.service, additionalWork: wo.additionalWork });
  const invoice = await createInvoice({
    customerId: wo.appointment.customerId,
    billToContactId: wo.appointment.customer.familyContacts[0]?.id ?? null,
    appointmentId: wo.appointmentId,
    lines,
    notes: `Appointment ${wo.appointment.reference}`,
  });
  await audit({ actorUserId, action: "invoice.created_from_work_order", entityType: "Invoice", entityId: invoice.id, metadata: { workOrderId, appointmentId: wo.appointmentId, totalCents: invoice.totalCents } });
  return invoice;
}

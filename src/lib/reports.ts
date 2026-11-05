import { prisma } from "./db";
import { formatCents } from "./money";
import { addDaysToKey, startOfDayUtc, toDateKey, weekdayOfKey } from "./time";

/**
 * Reports built from real application data. Each report returns a simple
 * table so it can be rendered on screen and exported to CSV.
 */
export type ReportTable = { title: string; description: string; columns: string[]; rows: (string | number)[][]; summary?: [string, string][] };
export type Range = { from: Date; to: Date; fromKey: string; toKey: string; tz: string };

export function makeRange(fromKey: string, toKey: string, tz: string): Range {
  return { from: startOfDayUtc(fromKey, tz), to: startOfDayUtc(addDaysToKey(toKey, 1), tz), fromKey, toKey, tz };
}

const money = (c: number) => (c / 100).toFixed(2);
const PAID_PAYMENT = { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] as ("SUCCEEDED" | "PARTIALLY_REFUNDED" | "REFUNDED")[] };

export async function revenueReport(r: Range): Promise<ReportTable> {
  const payments = await prisma.payment.findMany({ where: { status: PAID_PAYMENT, receivedAt: { gte: r.from, lt: r.to } }, orderBy: { receivedAt: "asc" } });
  const byMonth = new Map<string, { gross: number; refunds: number; count: number; stripe: number; manual: number }>();
  for (const p of payments) {
    const k = toDateKey(p.receivedAt, r.tz).slice(0, 7);
    const m = byMonth.get(k) ?? { gross: 0, refunds: 0, count: 0, stripe: 0, manual: 0 };
    m.gross += p.amountCents;
    m.refunds += p.refundedCents;
    m.count++;
    if (p.method === "STRIPE") m.stripe += p.amountCents;
    else m.manual += p.amountCents;
    byMonth.set(k, m);
  }
  const rows = [...byMonth.entries()].map(([k, m]) => [k, m.count, money(m.gross), money(m.refunds), money(m.gross - m.refunds), money(m.stripe), money(m.manual)]);
  const total = payments.reduce((s, p) => s + p.amountCents - p.refundedCents, 0);
  return {
    title: "Revenue",
    description: "Verified payments received, by month. Stripe payments are counted only after webhook verification; cash/check are staff-recorded.",
    columns: ["Month", "Payments", "Gross", "Refunds", "Net", "Card (Stripe)", "Cash/check/other"],
    rows,
    summary: [["Net revenue", formatCents(total)], ["Payments", String(payments.length)]],
  };
}

async function paidInvoiceLines(r: Range) {
  return prisma.invoiceLine.findMany({
    where: { invoice: { status: { in: ["PAID", "PARTIALLY_PAID"] }, issuedAt: { gte: r.from, lt: r.to } } },
    include: { service: true, invoice: { include: { appointment: { include: { service: true, technician: true } }, facility: true } } },
  });
}

export async function revenueByServiceReport(r: Range): Promise<ReportTable> {
  const lines = await paidInvoiceLines(r);
  const map = new Map<string, { amount: number; count: number }>();
  for (const l of lines) {
    const name = l.service?.name ?? l.invoice.appointment?.service.name ?? (l.kind === "DISCOUNT" || l.amountCents < 0 ? "Discounts" : "Other / unlinked");
    const m = map.get(name) ?? { amount: 0, count: 0 };
    m.amount += l.amountCents;
    m.count++;
    map.set(name, m);
  }
  return {
    title: "Revenue by service",
    description: "Invoice line amounts on paid and partially paid invoices issued in the period, grouped by service.",
    columns: ["Service", "Line items", "Amount"],
    rows: [...map.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([k, v]) => [k, v.count, money(v.amount)]),
  };
}

export async function revenueByTechnicianReport(r: Range): Promise<ReportTable> {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["PAID", "PARTIALLY_PAID"] }, issuedAt: { gte: r.from, lt: r.to } },
    include: { appointment: { include: { technician: true } }, techHelpDay: { include: { technician: true } } },
  });
  const map = new Map<string, { amount: number; count: number }>();
  for (const i of invoices) {
    const name = i.appointment?.technician?.displayName ?? i.techHelpDay?.technician?.displayName ?? "Unassigned / not linked";
    const m = map.get(name) ?? { amount: 0, count: 0 };
    m.amount += i.amountPaidCents - i.amountRefundedCents;
    m.count++;
    map.set(name, m);
  }
  return { title: "Revenue by technician", description: "Amount collected on invoices linked to each technician's appointments or Tech Help Days.", columns: ["Technician", "Invoices", "Collected"], rows: [...map.entries()].map(([k, v]) => [k, v.count, money(v.amount)]) };
}

export async function revenueByFacilityReport(r: Range): Promise<ReportTable> {
  const [facilityInvoices, residentAppts] = await Promise.all([
    prisma.invoice.findMany({ where: { facilityId: { not: null }, issuedAt: { gte: r.from, lt: r.to }, status: { notIn: ["VOID", "DRAFT"] } }, include: { facility: true } }),
    prisma.invoice.findMany({ where: { facilityId: null, appointment: { facilityId: { not: null } }, issuedAt: { gte: r.from, lt: r.to }, status: { notIn: ["VOID", "DRAFT"] } }, include: { appointment: { include: { facility: true } } } }),
  ]);
  const map = new Map<string, { billedFacility: number; collectedFacility: number; residentCollected: number }>();
  for (const i of facilityInvoices) {
    const m = map.get(i.facility!.name) ?? { billedFacility: 0, collectedFacility: 0, residentCollected: 0 };
    m.billedFacility += i.totalCents;
    m.collectedFacility += i.amountPaidCents - i.amountRefundedCents;
    map.set(i.facility!.name, m);
  }
  for (const i of residentAppts) {
    const n = i.appointment!.facility!.name;
    const m = map.get(n) ?? { billedFacility: 0, collectedFacility: 0, residentCollected: 0 };
    m.residentCollected += i.amountPaidCents - i.amountRefundedCents;
    map.set(n, m);
  }
  return {
    title: "Revenue by facility",
    description: "Facility-billed invoices (sponsored days, contracts) and resident-paid invoices for appointments at each community.",
    columns: ["Facility", "Billed to facility", "Collected from facility", "Collected from residents"],
    rows: [...map.entries()].map(([k, v]) => [k, money(v.billedFacility), money(v.collectedFacility), money(v.residentCollected)]),
  };
}

export async function appointmentsReport(r: Range): Promise<ReportTable> {
  const appts = await prisma.appointment.findMany({ where: { startsAt: { gte: r.from, lt: r.to } }, include: { service: true } });
  const statuses = ["REQUESTED", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELED", "NO_SHOW"];
  const byService = new Map<string, Record<string, number>>();
  for (const a of appts) {
    const m = byService.get(a.service.name) ?? Object.fromEntries(statuses.map((s) => [s, 0]));
    m[a.status]++;
    byService.set(a.service.name, m);
  }
  const completedWithInvoice = await prisma.invoice.findMany({ where: { appointment: { status: "COMPLETED", startsAt: { gte: r.from, lt: r.to } }, status: { notIn: ["VOID", "DRAFT"] } }, select: { totalCents: true } });
  const avg = completedWithInvoice.length ? Math.round(completedWithInvoice.reduce((s, i) => s + i.totalCents, 0) / completedWithInvoice.length) : 0;
  return {
    title: "Appointments",
    description: "Appointments scheduled in the period by service and current status.",
    columns: ["Service", ...statuses.map((s) => s.replace("_", " ").toLowerCase()), "Total"],
    rows: [...byService.entries()].map(([k, v]) => [k, ...statuses.map((s) => v[s]), Object.values(v).reduce((x, y) => x + y, 0)]),
    summary: [
      ["Total appointments", String(appts.length)],
      ["Completed", String(appts.filter((a) => a.status === "COMPLETED").length)],
      ["Average ticket (completed, invoiced)", completedWithInvoice.length ? formatCents(avg) : "No invoiced visits yet"],
    ],
  };
}

export async function averageTicketReport(r: Range): Promise<ReportTable> {
  const invoices = await prisma.invoice.findMany({ where: { issuedAt: { gte: r.from, lt: r.to }, status: { notIn: ["VOID", "DRAFT"] }, customerId: { not: null } }, select: { totalCents: true, issuedAt: true } });
  const byMonth = new Map<string, number[]>();
  for (const i of invoices) {
    const k = toDateKey(i.issuedAt!, r.tz).slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), i.totalCents]);
  }
  return {
    title: "Average ticket",
    description: "Average customer invoice total by month (issued invoices, excluding void and draft).",
    columns: ["Month", "Invoices", "Average", "Total billed"],
    rows: [...byMonth.entries()].sort().map(([k, v]) => [k, v.length, money(Math.round(v.reduce((a, b) => a + b, 0) / v.length)), money(v.reduce((a, b) => a + b, 0))]),
  };
}

export async function repeatCustomersReport(r: Range): Promise<ReportTable> {
  const groups = await prisma.appointment.groupBy({ by: ["customerId"], where: { status: "COMPLETED", startsAt: { lt: r.to } }, _count: { _all: true } });
  const repeat = groups.filter((g) => g._count._all >= 2);
  const customers = await prisma.customer.findMany({ where: { id: { in: repeat.map((g) => g.customerId) } } });
  return {
    title: "Repeat customers",
    description: "Customers with two or more completed visits (all time, up to the end of the period).",
    columns: ["Customer", "Completed visits"],
    rows: repeat.sort((a, b) => b._count._all - a._count._all).map((g) => {
      const c = customers.find((x) => x.id === g.customerId);
      return [c ? `${c.firstName} ${c.lastName}` : g.customerId, g._count._all];
    }),
    summary: [
      ["Customers with a completed visit", String(groups.length)],
      ["Repeat customers", String(repeat.length)],
      ["Repeat rate", groups.length ? `${Math.round((repeat.length / groups.length) * 100)}%` : "—"],
    ],
  };
}

export async function membershipReport(r: Range): Promise<ReportTable> {
  const all = await prisma.membership.findMany({ include: { plan: true } });
  const monthly = (m: (typeof all)[number]) => (m.plan.interval === "YEAR" ? Math.round(m.priceCents / 12) : m.priceCents);
  const activeAtStart = all.filter((m) => m.startedAt && m.startedAt < r.from && (!m.canceledAt || m.canceledAt >= r.from));
  const canceledInRange = all.filter((m) => m.canceledAt && m.canceledAt >= r.from && m.canceledAt < r.to);
  const startedInRange = all.filter((m) => m.startedAt && m.startedAt >= r.from && m.startedAt < r.to);
  const active = all.filter((m) => m.status === "ACTIVE");
  const mrr = active.reduce((s, m) => s + monthly(m), 0);
  const churn = activeAtStart.length ? (canceledInRange.filter((m) => activeAtStart.includes(m)).length / activeAtStart.length) * 100 : null;
  const byPlan = new Map<string, { active: number; mrr: number; pastDue: number }>();
  for (const m of all) {
    const p = byPlan.get(m.plan.name) ?? { active: 0, mrr: 0, pastDue: 0 };
    if (m.status === "ACTIVE") {
      p.active++;
      p.mrr += monthly(m);
    }
    if (m.status === "PAST_DUE") p.pastDue++;
    byPlan.set(m.plan.name, p);
  }
  return {
    title: "Membership recurring revenue & churn",
    description: "Monthly recurring revenue from active memberships, and churn for the period (cancellations among members active at the start of the period).",
    columns: ["Plan", "Active", "Past due", "MRR"],
    rows: [...byPlan.entries()].map(([k, v]) => [k, v.active, v.pastDue, money(v.mrr)]),
    summary: [
      ["MRR (current)", formatCents(mrr)],
      ["Active members", String(active.length)],
      ["New in period", String(startedInRange.length)],
      ["Canceled in period", String(canceledInRange.length)],
      ["Churn rate", churn == null ? "Not enough history" : `${churn.toFixed(1)}%`],
    ],
  };
}

export async function cancellationsReport(r: Range): Promise<ReportTable> {
  const appts = await prisma.appointment.findMany({ where: { startsAt: { gte: r.from, lt: r.to } }, select: { status: true, cancelReason: true, canceledAt: true, startsAt: true } });
  const canceled = appts.filter((a) => a.status === "CANCELED");
  const noShow = appts.filter((a) => a.status === "NO_SHOW").length;
  const late = canceled.filter((a) => a.canceledAt && a.startsAt.getTime() - a.canceledAt.getTime() < 24 * 3600_000).length;
  const reasons = new Map<string, number>();
  for (const a of canceled) reasons.set(a.cancelReason?.trim() || "(no reason given)", (reasons.get(a.cancelReason?.trim() || "(no reason given)") ?? 0) + 1);
  return {
    title: "Cancellations",
    description: "Canceled appointments in the period, by reason.",
    columns: ["Reason", "Count"],
    rows: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
    summary: [
      ["Canceled", String(canceled.length)],
      ["Cancellation rate", appts.length ? `${Math.round((canceled.length / appts.length) * 100)}%` : "—"],
      ["Canceled within 24 hours", String(late)],
      ["No-shows", String(noShow)],
    ],
  };
}

export async function outstandingInvoicesReport(r: Range): Promise<ReportTable> {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } }, include: { customer: true, facility: true }, orderBy: { dueAt: "asc" } });
  const rows = invoices.map((i) => {
    const bal = i.totalCents - (i.amountPaidCents - i.amountRefundedCents);
    const daysOver = i.dueAt ? Math.floor((now.getTime() - i.dueAt.getTime()) / 86400_000) : 0;
    const bucket = daysOver <= 0 ? "Current" : daysOver <= 30 ? "1-30 days" : daysOver <= 60 ? "31-60 days" : "Over 60 days";
    return [i.number, i.customer ? `${i.customer.firstName} ${i.customer.lastName}` : (i.facility?.name ?? ""), i.dueAt ? toDateKey(i.dueAt, r.tz) : "", money(bal), bucket];
  });
  const total = invoices.reduce((s, i) => s + i.totalCents - (i.amountPaidCents - i.amountRefundedCents), 0);
  return { title: "Outstanding invoices", description: "All unpaid and partially paid invoices with aging (not limited to the date range).", columns: ["Invoice", "Bill to", "Due", "Balance", "Aging"], rows, summary: [["Total outstanding", formatCents(total)], ["Invoices", String(invoices.length)]] };
}

export async function utilizationReport(r: Range): Promise<ReportTable> {
  const techs = await prisma.technician.findMany({
    include: {
      schedules: true,
      appointments: { where: { startsAt: { gte: r.from, lt: r.to }, status: { notIn: ["CANCELED", "NO_SHOW"] } } },
      techHelpDays: { where: { startsAt: { gte: r.from, lt: r.to }, status: { not: "CANCELED" } } },
      blackouts: { where: { startsAt: { lt: r.to }, endsAt: { gt: r.from } } },
    },
  });
  const rows = techs.map((t) => {
    let scheduled = 0;
    for (let k = r.fromKey; k <= r.toKey; k = addDaysToKey(k, 1)) {
      const wd = weekdayOfKey(k);
      scheduled += t.schedules.filter((s) => s.dayOfWeek === wd).reduce((s, x) => s + (x.endMinute - x.startMinute), 0);
    }
    const timeOff = t.blackouts.reduce((s, b) => s + Math.max(0, (Math.min(b.endsAt.getTime(), r.to.getTime()) - Math.max(b.startsAt.getTime(), r.from.getTime())) / 60000), 0);
    const available = Math.max(0, scheduled - timeOff);
    const booked = t.appointments.filter((a) => !a.techHelpDayId).reduce((s, a) => s + (a.endsAt.getTime() - a.startsAt.getTime()) / 60000, 0) + t.techHelpDays.reduce((s, h) => s + (h.endsAt.getTime() - h.startsAt.getTime()) / 60000, 0);
    return [t.displayName, Math.round(available / 6) / 10, Math.round(booked / 6) / 10, available ? `${Math.round((booked / available) * 100)}%` : "—"];
  });
  return { title: "Technician utilization", description: "Booked hours (appointments and Tech Help Days) as a share of scheduled working hours, net of time off.", columns: ["Technician", "Available hours", "Booked hours", "Utilization"], rows };
}

export async function mileageReport(r: Range): Promise<ReportTable> {
  const plans = await prisma.routePlan.findMany({ where: { date: { gte: r.fromKey, lte: r.toKey } }, include: { technician: true }, orderBy: { date: "asc" } });
  const rows = plans.map((p) => [p.date, p.technician.displayName, p.appointmentIds.length, p.totalDistanceMeters != null ? (p.totalDistanceMeters / 1609.344).toFixed(1) : "not calculated", p.totalDurationSeconds != null ? Math.round(p.totalDurationSeconds / 60) : "not calculated", p.provider]);
  const miles = plans.reduce((s, p) => s + (p.totalDistanceMeters ?? 0), 0) / 1609.344;
  return {
    title: "Travel mileage",
    description: "Estimated driving between stops from saved route plans. Only routes calculated with a maps provider have mileage; manual routes show 'not calculated'. Verify against odometer records for tax purposes.",
    columns: ["Date", "Technician", "Stops", "Miles (est.)", "Drive minutes (est.)", "Source"],
    rows,
    summary: [["Estimated miles (calculated routes)", miles.toFixed(1)]],
  };
}

export async function leadSourcesReport(r: Range): Promise<ReportTable> {
  const [customers, appts] = await Promise.all([
    prisma.customer.groupBy({ by: ["leadSource"], where: { createdAt: { gte: r.from, lt: r.to } }, _count: { _all: true } }),
    prisma.appointment.findMany({ where: { createdAt: { gte: r.from, lt: r.to } }, select: { leadSource: true, status: true } }),
  ]);
  const map = new Map<string, { customers: number; bookings: number; completed: number }>();
  for (const c of customers) map.set(c.leadSource || "(not given)", { customers: c._count._all, bookings: 0, completed: 0 });
  for (const a of appts) {
    const k = a.leadSource || "(not given)";
    const m = map.get(k) ?? { customers: 0, bookings: 0, completed: 0 };
    m.bookings++;
    if (a.status === "COMPLETED") m.completed++;
    map.set(k, m);
  }
  return { title: "Lead sources", description: "How new customers and bookings heard about us.", columns: ["Source", "New customers", "Bookings", "Completed"], rows: [...map.entries()].sort((a, b) => b[1].bookings - a[1].bookings).map(([k, v]) => [k, v.customers, v.bookings, v.completed]) };
}

export async function bookingConversionReport(r: Range): Promise<ReportTable> {
  const appts = await prisma.appointment.findMany({ where: { createdAt: { gte: r.from, lt: r.to } }, select: { source: true, status: true } });
  const [messages, inquiries] = await Promise.all([prisma.contactMessage.count({ where: { createdAt: { gte: r.from, lt: r.to } } }), prisma.facilityInquiry.count({ where: { createdAt: { gte: r.from, lt: r.to } } })]);
  const map = new Map<string, { requests: number; confirmed: number; completed: number; canceled: number }>();
  for (const a of appts) {
    const m = map.get(a.source) ?? { requests: 0, confirmed: 0, completed: 0, canceled: 0 };
    m.requests++;
    if (["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"].includes(a.status)) m.confirmed++;
    if (a.status === "COMPLETED") m.completed++;
    if (a.status === "CANCELED" || a.status === "NO_SHOW") m.canceled++;
    map.set(a.source, m);
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return {
    title: "Booking conversion",
    description: "Bookings created in the period by channel: how many were confirmed and completed. Website visitor counts are not tracked (no analytics installed).",
    columns: ["Channel", "Bookings", "Confirmed or later", "Completed", "Canceled/no-show", "Completion rate"],
    rows: [...map.entries()].map(([k, v]) => [k, v.requests, v.confirmed, v.completed, v.canceled, pct(v.completed, v.requests)]),
    summary: [["Contact messages", String(messages)], ["Facility inquiries", String(inquiries)]],
  };
}

export const REPORTS = {
  revenue: revenueReport,
  "revenue-by-service": revenueByServiceReport,
  "revenue-by-technician": revenueByTechnicianReport,
  "revenue-by-facility": revenueByFacilityReport,
  appointments: appointmentsReport,
  "average-ticket": averageTicketReport,
  "repeat-customers": repeatCustomersReport,
  memberships: membershipReport,
  cancellations: cancellationsReport,
  outstanding: outstandingInvoicesReport,
  utilization: utilizationReport,
  mileage: mileageReport,
  "lead-sources": leadSourcesReport,
  conversion: bookingConversionReport,
} as const;
export type ReportKey = keyof typeof REPORTS;

/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export function toCsv(table: ReportTable): string {
  const esc = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [table.columns, ...table.rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

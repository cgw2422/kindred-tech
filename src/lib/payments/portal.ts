import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { invoiceBalance } from "../pricing";
import type { SessionUser } from "../auth/session";

/**
 * Customer-portal billing queries.
 *
 * A signed-in user may see an invoice when either
 *  - they are the account holder: invoice.customerId === user.customerId, or
 *  - they are the bill-to family payer: invoice.billToContactId is a
 *    FamilyContact with userId === user.id and canPay === true.
 * Family payers see only the amount, dates, and line descriptions (no notes,
 * no service details), because paying does not grant access to private details.
 */

export type PortalInvoiceView = "owner" | "payer";

export type PortalInvoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  view: PortalInvoiceView;
  issuedAt: Date | null;
  dueAt: Date | null;
  totalCents: number;
  amountPaidCents: number;
  amountRefundedCents: number;
  depositCents: number;
  balanceCents: number;
  lines: { description: string; quantity: number; amountCents: number }[];
  /** Only for family payers: whose invoice this is (first name and last initial). */
  forName: string | null;
};

async function payerContactIds(userId: string): Promise<string[]> {
  const contacts = await prisma.familyContact.findMany({ where: { userId, canPay: true }, select: { id: true } });
  return contacts.map((c) => c.id);
}

/** Prisma filter for invoices visible to the user in the portal (never drafts). */
export async function portalInvoiceWhere(user: Pick<SessionUser, "id" | "customerId">): Promise<Prisma.InvoiceWhereInput | null> {
  const contactIds = await payerContactIds(user.id);
  const or: Prisma.InvoiceWhereInput[] = [];
  if (user.customerId) or.push({ customerId: user.customerId });
  if (contactIds.length) or.push({ billToContactId: { in: contactIds } });
  if (or.length === 0) return null;
  return { status: { not: "DRAFT" }, OR: or };
}

function toPortalInvoice(
  inv: Prisma.InvoiceGetPayload<{ include: { lines: true; customer: { select: { firstName: true; lastName: true } } } }>,
  user: Pick<SessionUser, "customerId">,
): PortalInvoice {
  const view: PortalInvoiceView = user.customerId && inv.customerId === user.customerId ? "owner" : "payer";
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    view,
    issuedAt: inv.issuedAt,
    dueAt: inv.dueAt,
    totalCents: inv.totalCents,
    amountPaidCents: inv.amountPaidCents,
    amountRefundedCents: inv.amountRefundedCents,
    depositCents: inv.depositCents,
    balanceCents: inv.status === "VOID" ? 0 : invoiceBalance(inv),
    lines: [...inv.lines].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ description: l.description, quantity: l.quantity, amountCents: l.amountCents })),
    forName: view === "payer" && inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName.slice(0, 1)}.` : null,
  };
}

export async function listInvoicesForUser(user: Pick<SessionUser, "id" | "customerId">, opts: { take?: number } = {}): Promise<PortalInvoice[]> {
  const where = await portalInvoiceWhere(user);
  if (!where) return [];
  const rows = await prisma.invoice.findMany({
    where,
    include: { lines: true, customer: { select: { firstName: true, lastName: true } } },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 50,
  });
  return rows.map((r) => toPortalInvoice(r, user));
}

/** Returns the invoice if the user may see it, else null. */
export async function getInvoiceForUser(user: Pick<SessionUser, "id" | "customerId">, invoiceId: string): Promise<PortalInvoice | null> {
  const where = await portalInvoiceWhere(user);
  if (!where) return null;
  const inv = await prisma.invoice.findFirst({ where: { AND: [where, { id: invoiceId }] }, include: { lines: true, customer: { select: { firstName: true, lastName: true } } } });
  return inv ? toPortalInvoice(inv, user) : null;
}

/** Customers the user may buy a membership for: their own account, plus customers who granted them canPay. */
export async function membershipPurchaseTargets(user: Pick<SessionUser, "id" | "customerId">) {
  const targets: { customerId: string; name: string; purchaserContactId: string | null }[] = [];
  if (user.customerId) {
    const c = await prisma.customer.findUnique({ where: { id: user.customerId } });
    if (c) targets.push({ customerId: c.id, name: `${c.firstName} ${c.lastName}`, purchaserContactId: null });
  }
  const contacts = await prisma.familyContact.findMany({ where: { userId: user.id, canPay: true }, include: { customer: true } });
  for (const fc of contacts) {
    if (!targets.some((t) => t.customerId === fc.customerId)) targets.push({ customerId: fc.customerId, name: `${fc.customer.firstName} ${fc.customer.lastName}`, purchaserContactId: fc.id });
  }
  return targets;
}

/** Validates a portal return path (must stay inside /portal). */
export function safePortalPath(input: string | null | undefined, fallback = "/portal"): string {
  if (!input || !input.startsWith("/portal") || input.startsWith("//") || input.includes("\\")) return fallback;
  return input.split("#")[0];
}

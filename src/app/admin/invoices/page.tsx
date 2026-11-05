import type { Metadata } from "next";
import Link from "next/link";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { invoiceBalance } from "@/lib/pricing";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { ButtonLink, EmptyState, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { InvoiceStatusBadge } from "@/components/status";

const SHORT: Intl.DateTimeFormatOptions = { weekday: undefined, month: "short" };
export const metadata: Metadata = { title: "Invoices" };

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "outstanding", label: "Outstanding" },
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
  { value: "REFUNDED", label: "Refunded" },
];
const PAGE_SIZE = 50;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("billing:view", "/admin/invoices");
  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.InvoiceWhereInput = {};
  if (status === "outstanding") where.status = { in: ["OPEN", "PARTIALLY_PAID"] };
  else if (STATUSES.some((s) => s.value === status && s.value)) where.status = status as InvoiceStatus;
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customer: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } },
      { facility: { name: { contains: q, mode: "insensitive" } } },
      { billToContact: { name: { contains: q, mode: "insensitive" } } },
    ];
    const parts = q.split(/\s+/);
    if (parts.length === 2) where.OR.push({ customer: { firstName: { contains: parts[0], mode: "insensitive" }, lastName: { contains: parts[1], mode: "insensitive" } } });
  }

  const [rows, count, outstanding] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { customer: { select: { id: true, firstName: true, lastName: true } }, facility: { select: { id: true, name: true } }, billToContact: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } }, select: { totalCents: true, amountPaidCents: true, amountRefundedCents: true, dueAt: true } }),
  ]);
  const now = new Date();
  const outstandingCents = outstanding.reduce((s, i) => s + invoiceBalance(i), 0);
  const overdueRows = outstanding.filter((i) => i.dueAt && i.dueAt < now);
  const overdueCents = overdueRows.reduce((s, i) => s + invoiceBalance(i), 0);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const qs = (p: Record<string, string | number>) => {
    const u = new URLSearchParams();
    if (status) u.set("status", status);
    if (q) u.set("q", q);
    for (const [k, v] of Object.entries(p)) u.set(k, String(v));
    return `?${u.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create, issue, and collect payment on invoices."
        actions={can(user.role, "billing:manage") ? <ButtonLink href="/admin/invoices/new">New invoice</ButtonLink> : undefined}
      />
      {!isStripeConfigured() && (
        <div className="mb-4">
          <Notice tone="warn" title="Online card payment is not configured">
            Invoices can still be issued and emailed. They are labelled &ldquo;Unpaid — online card payment is not configured&rdquo; for customers, and staff can record cash and check payments manually.
          </Notice>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatCents(outstandingCents)} hint={`${outstanding.length} open invoice${outstanding.length === 1 ? "" : "s"}`} href="/admin/invoices?status=outstanding" />
        <Stat label="Overdue" value={formatCents(overdueCents)} hint={`${overdueRows.length} past due date`} />
        <Stat label="Matching" value={count} hint="invoices for the current filters" />
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm font-semibold text-navy">
          Search
          <input name="q" defaultValue={q} placeholder="Invoice number, customer, facility" className="mt-1 block w-72 max-w-full rounded-md border-2 border-line px-3 py-2" />
        </label>
        <label className="text-sm font-semibold text-navy">
          Status
          <select name="status" defaultValue={status} className="mt-1 block rounded-md border-2 border-line px-3 py-2">
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
          Filter
        </button>
        {(q || status) && <Link href="/admin/invoices">Clear</Link>}
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No invoices found">{q || status ? "Try a different search or filter." : "Create your first invoice to get started."}</EmptyState>
      ) : (
        <Table caption="Invoices">
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Bill to</Th>
              <Th>Status</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => {
              const balance = inv.status === "VOID" || inv.status === "DRAFT" ? 0 : invoiceBalance(inv);
              const late = balance > 0 && inv.dueAt && inv.dueAt < now;
              return (
                <tr key={inv.id}>
                  <Td>
                    <Link href={`/admin/invoices/${inv.id}`} className="font-semibold">
                      {inv.number}
                    </Link>
                  </Td>
                  <Td>
                    {inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : inv.facility?.name ?? "—"}
                    {inv.billToContact && <span className="block text-sm text-body">Payer: {inv.billToContact.name}</span>}
                  </Td>
                  <Td>
                    <InvoiceStatusBadge status={inv.status} />
                  </Td>
                  <Td>{inv.issuedAt ? formatDate(inv.issuedAt, undefined, SHORT) : "—"}</Td>
                  <Td className={late ? "font-semibold text-danger" : ""}>{inv.dueAt ? formatDate(inv.dueAt, undefined, SHORT) : "—"}{late ? " (overdue)" : ""}</Td>
                  <Td className="text-right">{formatCents(inv.totalCents)}</Td>
                  <Td className="text-right font-semibold">{formatCents(balance)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center gap-4">
          {page > 1 && <Link href={qs({ page: page - 1 })}>Previous</Link>}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={qs({ page: page + 1 })}>Next</Link>}
        </nav>
      )}
    </>
  );
}

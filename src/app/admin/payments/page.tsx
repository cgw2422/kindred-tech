import type { Metadata } from "next";
import Link from "next/link";
import type { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { EmptyState, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { PaymentStatusBadge, humanize } from "@/components/status";

const SHORT: Intl.DateTimeFormatOptions = { weekday: undefined, month: "short" };
export const metadata: Metadata = { title: "Payments" };

const STATUSES: PaymentStatus[] = ["SUCCEEDED", "PENDING", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED"];
const METHODS: PaymentMethod[] = ["STRIPE", "CASH", "CHECK", "OTHER"];
const PAGE_SIZE = 50;

function parseDay(v: string | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("billing:view", "/admin/payments");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as PaymentStatus) ? (sp.status as PaymentStatus) : undefined;
  const method = METHODS.includes(sp.method as PaymentMethod) ? (sp.method as PaymentMethod) : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const from = parseDay(sp.from);
  const to = parseDay(sp.to);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const refundsOnly = sp.view === "refunds";

  const where: Prisma.PaymentWhereInput = {};
  if (status) where.status = status;
  if (method) where.method = method;
  if (from || to) where.receivedAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400_000) } : {}) };
  if (refundsOnly) where.refunds = { some: {} };
  if (q) {
    where.OR = [
      { invoice: { number: { contains: q, mode: "insensitive" } } },
      { customer: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } },
      { facility: { name: { contains: q, mode: "insensitive" } } },
      { reference: { contains: q, mode: "insensitive" } },
      { stripePaymentIntentId: q },
    ];
  }

  const [rows, count, totals, refundTotal] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        invoice: { select: { id: true, number: true } },
        membership: { select: { id: true, plan: { select: { name: true } } } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true } },
        recordedBy: { select: { name: true } },
        refunds: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { receivedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where: { ...where, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, _sum: { amountCents: true, refundedCents: true } }),
    prisma.refund.aggregate({ where: { status: "pending", payment: where }, _sum: { amountCents: true }, _count: true }),
  ]);
  const collected = totals._sum.amountCents ?? 0;
  const refunded = totals._sum.refundedCents ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const qs = (extra: Record<string, string | number>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") u.set(k, v);
    for (const [k, v] of Object.entries(extra)) u.set(k, String(v));
    return `?${u.toString()}`;
  };
  const select = "mt-1 block rounded-md border-2 border-line px-3 py-2";

  return (
    <>
      <PageHeader title="Payments" description="Card payments confirmed by Stripe and cash/check payments recorded by staff. Refunds are issued from the invoice page." />
      {!isStripeConfigured() && (
        <div className="mb-4">
          <Notice tone="warn">Online card payment is not configured. Only manually recorded payments will appear until Stripe is set up.</Notice>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Collected" value={formatCents(collected)} hint="for the current filters" />
        <Stat label="Refunded" value={formatCents(refunded)} hint="completed refunds" />
        <Stat label="Net" value={formatCents(collected - refunded)} hint={refundTotal._count ? `${refundTotal._count} refund(s) pending at Stripe (${formatCents(refundTotal._sum.amountCents ?? 0)})` : undefined} />
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm font-semibold text-navy">
          Search
          <input name="q" defaultValue={q} placeholder="Invoice, customer, reference" className="mt-1 block w-60 max-w-full rounded-md border-2 border-line px-3 py-2" />
        </label>
        <label className="text-sm font-semibold text-navy">
          Status
          <select name="status" defaultValue={status ?? ""} className={select}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-navy">
          Method
          <select name="method" defaultValue={method ?? ""} className={select}>
            <option value="">All</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m === "STRIPE" ? "Card (Stripe)" : humanize(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-navy">
          From
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={select} />
        </label>
        <label className="text-sm font-semibold text-navy">
          To
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={select} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-navy">
          <input type="checkbox" name="view" value="refunds" defaultChecked={refundsOnly} className="h-5 w-5 accent-green" />
          With refunds only
        </label>
        <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
          Filter
        </button>
        <Link href="/admin/payments">Clear</Link>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No payments found" />
      ) : (
        <Table caption="Payments">
          <thead>
            <tr>
              <Th>Received</Th>
              <Th>For</Th>
              <Th>Payer</Th>
              <Th>Method</Th>
              <Th>Status</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Refunded</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td>{formatDateTime(p.receivedAt)}</Td>
                <Td>
                  {p.invoice ? (
                    <Link href={`/admin/invoices/${p.invoice.id}`}>Invoice {p.invoice.number}</Link>
                  ) : p.membership ? (
                    <Link href={`/admin/memberships/${p.membership.id}`}>{p.membership.plan.name} membership</Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : (p.facility?.name ?? "—")}</Td>
                <Td>
                  {p.method === "STRIPE" ? "Card (Stripe)" : humanize(p.method)}
                  {p.method !== "STRIPE" && <span className="block text-sm text-body">Manually recorded{p.recordedBy ? ` by ${p.recordedBy.name}` : ""}</span>}
                  {p.reference && p.method !== "STRIPE" && <span className="block text-sm text-body">Ref {p.reference}</span>}
                </Td>
                <Td>
                  <PaymentStatusBadge status={p.status} />
                  {p.failureReason && <span className="block text-sm text-danger">{p.failureReason}</span>}
                </Td>
                <Td className="text-right">{formatCents(p.amountCents)}</Td>
                <Td className="text-right">
                  {p.refundedCents ? formatCents(p.refundedCents) : "—"}
                  {p.refunds.map((r) => (
                    <span key={r.id} className="block text-sm text-body">
                      {formatCents(r.amountCents)} {r.status === "succeeded" ? "" : `(${r.status})`} {formatDate(r.createdAt, undefined, SHORT)}
                    </span>
                  ))}
                </Td>
              </tr>
            ))}
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

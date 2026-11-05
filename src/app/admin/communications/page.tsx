import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { humanize } from "@/components/status";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { CHANNELS, COMM_STATUSES, communicationWhere } from "@/lib/admin/communications";
import { PAGE_SIZE, pageFromParam } from "@/lib/admin/common";
import { COMMS_NAV, Pagination, SubNav, sp as one } from "../_config/nav";
import { commStatusTone } from "../_config/tones";

export const metadata: Metadata = { title: "Communications" };


const selectClass = "rounded-md border-2 border-line bg-white px-3 py-2";

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("communications:view", "/admin/communications");
  const raw = await searchParams;
  const filters = { channel: one(raw.channel), status: one(raw.status), template: one(raw.template), q: one(raw.q) };
  const page = pageFromParam(raw.page);
  const tz = (await getSettings("business")).timeZone;
  const where = communicationWhere(filters);
  const [rows, total, templateKeys] = await Promise.all([
    prisma.communication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { id: true, firstName: true, lastName: true } }, facility: { select: { id: true, name: true } } },
    }),
    prisma.communication.count({ where }),
    prisma.communication.findMany({ where: { templateKey: { not: null } }, distinct: ["templateKey"], select: { templateKey: true }, orderBy: { templateKey: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Communications" description="Every email sent or skipped, plus logged calls and notes." />
      <SubNav items={COMMS_NAV} current="/admin/communications" label="Communications sections" />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4" role="search" aria-label="Filter communications">
        <div>
          <label htmlFor="f-q" className="mb-1 block text-sm font-semibold text-navy">
            Recipient or customer
          </label>
          <input id="f-q" name="q" type="search" defaultValue={filters.q ?? ""} className={selectClass} placeholder="Name or email" />
        </div>
        <div>
          <label htmlFor="f-channel" className="mb-1 block text-sm font-semibold text-navy">
            Channel
          </label>
          <select id="f-channel" name="channel" defaultValue={filters.channel ?? ""} className={selectClass}>
            <option value="">All</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-sm font-semibold text-navy">
            Status
          </label>
          <select id="f-status" name="status" defaultValue={filters.status ?? ""} className={selectClass}>
            <option value="">All</option>
            {COMM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-template" className="mb-1 block text-sm font-semibold text-navy">
            Template
          </label>
          <select id="f-template" name="template" defaultValue={filters.template ?? ""} className={selectClass}>
            <option value="">All</option>
            {templateKeys.map((t) => (
              <option key={t.templateKey} value={t.templateKey!}>
                {t.templateKey}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-navy px-5 py-2 font-semibold text-white">
          Filter
        </button>
        <Link href="/admin/communications" className="py-2">
          Clear
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No communications found" />
      ) : (
        <Table caption="Communication log">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Channel</Th>
              <Th>To / Customer</Th>
              <Th>Subject</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td className="whitespace-nowrap text-sm">
                  <Link href={`/admin/communications/${c.id}`}>{formatDateTime(c.createdAt, tz)}</Link>
                </Td>
                <Td>
                  {humanize(c.channel)}
                  {c.direction !== "OUTBOUND" && <div className="text-sm text-body">{humanize(c.direction)}</div>}
                </Td>
                <Td className="text-sm">
                  {c.customer ? <span className="font-semibold">{`${c.customer.firstName} ${c.customer.lastName}`}</span> : c.facility ? <span className="font-semibold">{c.facility.name}</span> : null}
                  {c.toAddress && <div className="break-all text-body">{c.toAddress}</div>}
                </Td>
                <Td>
                  <Link href={`/admin/communications/${c.id}`}>{c.subject ?? c.templateKey ?? "(no subject)"}</Link>
                  {c.templateKey && c.subject && <div className="text-sm text-body">{c.templateKey}</div>}
                </Td>
                <Td>
                  <Badge tone={commStatusTone[c.status]}>{humanize(c.status)}</Badge>
                  {c.statusReason && <div className="mt-1 max-w-xs text-sm text-body">{c.statusReason}</div>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination basePath="/admin/communications" params={filters} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}

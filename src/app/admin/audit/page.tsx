import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDaysToKey, formatDateTime, startOfDayUtc } from "@/lib/time";
import { PAGE_SIZE, pageFromParam } from "@/lib/admin/common";
import { Pagination, sp as one } from "../_config/nav";

export const metadata: Metadata = { title: "Audit Log" };

const inputClass = "rounded-md border-2 border-line bg-white px-3 py-2";
const isDateKey = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function metadataSummary(meta: Prisma.JsonValue | null): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("audit:view", "/admin/audit");
  const raw = await searchParams;
  const f = { action: one(raw.action), entity: one(raw.entity), actor: one(raw.actor), from: one(raw.from), to: one(raw.to), entityId: one(raw.entityId) };
  const page = pageFromParam(raw.page);
  const tz = (await getSettings("business")).timeZone;

  const where: Prisma.AuditLogWhereInput = {};
  if (f.action) where.action = { contains: f.action, mode: "insensitive" };
  if (f.entity) where.entityType = f.entity;
  if (f.entityId) where.entityId = f.entityId;
  if (f.actor === "system") where.actorUserId = null;
  else if (f.actor) where.actorUserId = f.actor;
  const createdAt: Prisma.DateTimeFilter = {};
  if (isDateKey(f.from)) createdAt.gte = startOfDayUtc(f.from, tz);
  if (isDateKey(f.to)) createdAt.lt = startOfDayUtc(addDaysToKey(f.to, 1), tz);
  if (createdAt.gte || createdAt.lt) where.createdAt = createdAt;

  const [rows, total, entityTypes, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    prisma.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" }, take: 200 }),
  ]);

  return (
    <div>
      <PageHeader title="Audit Log" description="A record of sign-ins and changes made by staff and the system. Sensitive details are never stored here." />
      <form method="get" role="search" aria-label="Filter audit log" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4">
        <div>
          <label htmlFor="a-action" className="mb-1 block text-sm font-semibold text-navy">
            Action contains
          </label>
          <input id="a-action" name="action" type="search" defaultValue={f.action ?? ""} placeholder="e.g. login, service." className={inputClass} />
        </div>
        <div>
          <label htmlFor="a-entity" className="mb-1 block text-sm font-semibold text-navy">
            Record type
          </label>
          <select id="a-entity" name="entity" defaultValue={f.entity ?? ""} className={inputClass}>
            <option value="">All</option>
            {entityTypes.map((e) => (
              <option key={e.entityType} value={e.entityType}>
                {e.entityType}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="a-actor" className="mb-1 block text-sm font-semibold text-navy">
            Who
          </label>
          <select id="a-actor" name="actor" defaultValue={f.actor ?? ""} className={inputClass}>
            <option value="">Anyone</option>
            <option value="system">System / public</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.role.toLowerCase()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="a-from" className="mb-1 block text-sm font-semibold text-navy">
            From
          </label>
          <input id="a-from" name="from" type="date" defaultValue={f.from ?? ""} className={inputClass} />
        </div>
        <div>
          <label htmlFor="a-to" className="mb-1 block text-sm font-semibold text-navy">
            To
          </label>
          <input id="a-to" name="to" type="date" defaultValue={f.to ?? ""} className={inputClass} />
        </div>
        {f.entityId && <input type="hidden" name="entityId" value={f.entityId} />}
        <button type="submit" className="rounded-md bg-navy px-5 py-2 font-semibold text-white">
          Filter
        </button>
        <Link href="/admin/audit" className="py-2">
          Clear
        </Link>
      </form>
      {f.entityId && (
        <p className="mb-3">
          Showing entries for record <code>{f.entityId}</code>.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No audit entries match" />
      ) : (
        <Table caption="Audit log">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Record</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-sm">{formatDateTime(r.createdAt, tz)}</Td>
                <Td className="text-sm">
                  {r.actor ? (
                    <>
                      <span className="font-semibold">{r.actor.name}</span>
                      <div className="text-body">{r.actor.role.toLowerCase()}</div>
                    </>
                  ) : (
                    <span className="text-body">System / public</span>
                  )}
                </Td>
                <Td>
                  <code className="text-sm">{r.action}</code>
                </Td>
                <Td className="text-sm">
                  {r.entityType}
                  {r.entityId && (
                    <div>
                      <Link href={`/admin/audit?entity=${encodeURIComponent(r.entityType)}&entityId=${encodeURIComponent(r.entityId)}`} className="break-all text-body">
                        {r.entityId}
                      </Link>
                    </div>
                  )}
                </Td>
                <Td className="max-w-md break-words text-sm">
                  {metadataSummary(r.metadata)}
                  {r.ip && <div className="text-body">IP {r.ip}</div>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination basePath="/admin/audit" params={f} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { AppointmentStatusBadge, humanize } from "@/components/status";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatDuration, totalElapsedMs } from "@/lib/tech/access";
import { listWorkOrders, parseWorkOrderFilter, type WorkOrderFilter } from "@/lib/tech/admin-work-orders";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Work Orders" };

const FILTERS: { key: WorkOrderFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "invoice_requested", label: "Invoice requested" },
];

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("appointments:view", "/admin/work-orders");
  const sp = await searchParams;
  const filter = parseWorkOrderFilter(typeof sp.filter === "string" ? sp.filter : null);
  const [rows, biz] = await Promise.all([listWorkOrders(filter), getSettings("business")]);
  const tz = biz.timeZone;

  return (
    <div>
      <PageHeader title="Work Orders" description="Field work recorded by technicians: time, checklists, signatures, additional work and invoice requests." />
      <nav aria-label="Filter work orders" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/work-orders" : `/admin/work-orders?filter=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold no-underline ${filter === f.key ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No work orders">Work orders are created when a technician starts working on an appointment.</EmptyState>
      ) : (
        <Table caption="Work orders">
          <thead>
            <tr>
              <Th>Appointment</Th>
              <Th>Customer</Th>
              <Th>Technician</Th>
              <Th>Work order</Th>
              <Th>Time</Th>
              <Th>Invoice</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <Td>
                  <Link href={`/admin/work-orders/${w.id}`} className="font-semibold">
                    {formatDateTime(w.appointment.startsAt, tz)}
                  </Link>
                  <span className="block text-sm text-body">
                    {w.appointment.reference} · {w.appointment.service.name}
                  </span>
                </Td>
                <Td>
                  {w.appointment.customer.firstName} {w.appointment.customer.lastName}
                </Td>
                <Td>{w.technician?.displayName ?? "—"}</Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={w.status === "COMPLETED" ? "neutral" : w.status === "IN_PROGRESS" ? "green" : "navy"}>{humanize(w.status)}</Badge>
                    <AppointmentStatusBadge status={w.appointment.status} />
                  </div>
                </Td>
                <Td>{formatDuration(totalElapsedMs(w.timeEntries))}</Td>
                <Td>
                  {w.appointment.invoices.length > 0 ? (
                    w.appointment.invoices.map((inv) => (
                      <Link key={inv.id} href={`/admin/invoices/${inv.id}`} className="block">
                        {inv.number}
                      </Link>
                    ))
                  ) : w.invoiceRequestedAt ? (
                    <Badge tone="warn">Requested</Badge>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { Card, EmptyState, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";
import { makeRange, REPORTS, type ReportKey } from "@/lib/reports";
import { addDaysToKey, toDateKey } from "@/lib/time";

export const metadata = { title: "Reports" };

const LABELS: Record<ReportKey, string> = {
  revenue: "Revenue",
  "revenue-by-service": "By service",
  "revenue-by-technician": "By technician",
  "revenue-by-facility": "By facility",
  appointments: "Appointments",
  "average-ticket": "Average ticket",
  "repeat-customers": "Repeat customers",
  memberships: "Memberships & churn",
  cancellations: "Cancellations",
  outstanding: "Outstanding invoices",
  utilization: "Technician utilization",
  mileage: "Travel mileage",
  "lead-sources": "Lead sources",
  conversion: "Booking conversion",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("reports:view", "/admin/reports");
  const sp = await searchParams;
  const biz = await getSettings("business");
  const today = toDateKey(new Date(), biz.timeZone);
  const key = (sp.report && sp.report in REPORTS ? sp.report : "revenue") as ReportKey;
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const to = valid(sp.to) ?? today;
  const from = valid(sp.from) ?? `${today.slice(0, 4)}-01-01`;
  const table = await REPORTS[key](makeRange(from, to < from ? from : to, biz.timeZone));
  const qs = (o: Record<string, string>) => new URLSearchParams({ report: key, from, to, ...o }).toString();
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Built from live application data."
        actions={
          <a href={`/admin/reports/export?${qs({})}`} className={buttonClass("outline", "md")}>
            Download CSV
          </a>
        }
      />
      <nav aria-label="Reports" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(REPORTS) as ReportKey[]).map((k) => (
          <Link key={k} href={`/admin/reports?${qs({ report: k })}`} aria-current={k === key ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm font-semibold no-underline ${k === key ? "border-navy bg-navy text-white" : "border-line bg-white"}`}>
            {LABELS[k]}
          </Link>
        ))}
      </nav>
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <input type="hidden" name="report" value={key} />
        <div>
          <label htmlFor="from" className="block text-sm font-semibold text-navy">From</label>
          <input id="from" name="from" type="date" defaultValue={from} className="rounded-md border-2 border-line px-3 py-2" />
        </div>
        <div>
          <label htmlFor="to" className="block text-sm font-semibold text-navy">To</label>
          <input id="to" name="to" type="date" defaultValue={to} className="rounded-md border-2 border-line px-3 py-2" />
        </div>
        <button className="rounded-md bg-navy px-4 py-2 font-semibold text-white">Apply</button>
        <Link href={`/admin/reports?${qs({ from: addDaysToKey(today, -29), to: today })}`} className="pb-2 text-sm">Last 30 days</Link>
        <Link href={`/admin/reports?${qs({ from: `${today.slice(0, 7)}-01`, to: today })}`} className="pb-2 text-sm">This month</Link>
      </form>
      <Card>
        <h2 className="mb-1 text-xl">{table.title}</h2>
        <p className="mb-4 text-sm">{table.description}</p>
        {table.summary && (
          <dl className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {table.summary.map(([k, v]) => (
              <div key={k} className="rounded-md bg-soft p-3">
                <dt className="text-sm font-semibold">{k}</dt>
                <dd className="font-heading text-2xl text-navy">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {table.rows.length === 0 ? (
          <EmptyState title="No data for this period yet" />
        ) : (
          <Table caption={table.title}>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <Th key={c}>{c}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <Td key={j}>{v}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

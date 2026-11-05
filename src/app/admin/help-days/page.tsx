import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatDate, formatTime, toDateKey } from "@/lib/time";
import { Card, EmptyState, PageHeader, SectionTitle, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { ActionForm } from "../_config/ActionForm";
import { HELP_DAY_PAYMENT_LABELS, listHelpDays } from "@/lib/facilities/help-days";
import { describeRule, WEEK_OF_MONTH_LABELS, WEEKDAY_NAMES } from "@/lib/facilities/recurrence";
import { HelpDayStatusBadge } from "../facilities/_components/badges";
import { FInput, FSelect } from "../facilities/_components/fields";
import { HelpDayFields } from "./_components/HelpDayFields";
import { createHelpDayAction, createHelpDaySeriesAction } from "./actions";
import type { SeriesFrequency } from "@/lib/facilities/recurrence";

export const metadata: Metadata = { title: "Tech Help Days" };

export default async function HelpDaysPage({
  searchParams,
}: {
  searchParams: Promise<{ facilityId?: string; technicianId?: string; status?: string; range?: string }>;
}) {
  const user = await requirePermission("facilities:view", "/admin/help-days");
  const sp = await searchParams;
  const canManage = can(user.role, "facilities:manage");
  const tz = (await getSettings("business")).timeZone;
  const range = sp.range === "past" || sp.range === "all" ? sp.range : "upcoming";
  const [days, facilities, technicians] = await Promise.all([
    listHelpDays({ facilityId: sp.facilityId, technicianId: sp.technicianId, status: sp.status, range }),
    prisma.facility.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, partnershipStatus: true } }),
    prisma.technician.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);
  const techOptions = technicians.map((t) => ({ id: t.id, name: t.displayName }));
  const facOptions = facilities.filter((f) => f.partnershipStatus !== "ENDED").map((f) => ({ id: f.id, name: f.name }));
  const today = toDateKey(new Date(), tz);

  return (
    <div>
      <PageHeader
        eyebrow="Senior Living"
        title="Tech Help Days"
        description="On-site help sessions at partner communities. Residents reserve times on each day's sign-up page."
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <div>
          <label htmlFor="f-facility" className="mb-1 block text-sm font-semibold text-navy">
            Community
          </label>
          <select id="f-facility" name="facilityId" defaultValue={sp.facilityId ?? ""} className="rounded-md border-2 border-line bg-white px-3 py-2">
            <option value="">All communities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-tech" className="mb-1 block text-sm font-semibold text-navy">
            Technician
          </label>
          <select id="f-tech" name="technicianId" defaultValue={sp.technicianId ?? ""} className="rounded-md border-2 border-line bg-white px-3 py-2">
            <option value="">All technicians</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-sm font-semibold text-navy">
            Status
          </label>
          <select id="f-status" name="status" defaultValue={sp.status ?? ""} className="rounded-md border-2 border-line bg-white px-3 py-2">
            <option value="">Any status</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-range" className="mb-1 block text-sm font-semibold text-navy">
            When
          </label>
          <select id="f-range" name="range" defaultValue={range} className="rounded-md border-2 border-line bg-white px-3 py-2">
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
          Filter
        </button>
        {(sp.facilityId || sp.technicianId || sp.status || sp.range) && (
          <Link href="/admin/help-days" className="py-2 text-sm font-semibold">
            Clear
          </Link>
        )}
      </form>

      {days.length === 0 ? (
        <EmptyState title="No Tech Help Days match">{canManage ? "Create one below." : null}</EmptyState>
      ) : (
        <Table caption="Tech Help Days">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Time</Th>
              <Th>Community</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th>Technician</Th>
              <Th className="text-right">Residents booked</Th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Link href={`/admin/help-days/${d.id}`} className="font-semibold">
                    {formatDate(d.startsAt, tz, { weekday: "short", month: "short" })}
                  </Link>
                  {d.series && <div className="text-sm">Recurring</div>}
                </Td>
                <Td>
                  {formatTime(d.startsAt, tz)}–{formatTime(d.endsAt, tz)}
                </Td>
                <Td>
                  <Link href={`/admin/facilities/${d.facility.id}`}>{d.facility.name}</Link>
                </Td>
                <Td>
                  <HelpDayStatusBadge status={d.status} />
                </Td>
                <Td>{HELP_DAY_PAYMENT_LABELS[d.paymentModel]}</Td>
                <Td>{d.technician?.displayName ?? "Unassigned"}</Td>
                <Td className="text-right">{d._count.appointments}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {canManage && (
        <section id="create" className="mt-10 scroll-mt-6">
          <SectionTitle>Schedule a Tech Help Day</SectionTitle>
          {facOptions.length === 0 ? (
            <EmptyState title="Add a community first">
              <Link href="/admin/facilities/new">Add a partner community</Link>
            </EmptyState>
          ) : (
            <div className="grid gap-6 2xl:grid-cols-2">
              <Card>
                <h3 className="mb-3 text-lg">Single day</h3>
                <ActionForm action={createHelpDayAction}>
                  <HelpDayFields idPrefix="single" facilities={facOptions} technicians={techOptions} defaultFacilityId={sp.facilityId} tz={tz} withDate />
                  <SubmitButton pendingText="Checking the schedule...">Create Tech Help Day</SubmitButton>
                </ActionForm>
              </Card>
              <Card>
                <h3 className="mb-1 text-lg">Recurring series</h3>
                <p className="mb-3 text-sm">
                  Dates that conflict with the technician&apos;s appointments, other help days, time off or working hours are skipped and listed, never moved. Examples:{" "}
                  {(["WEEKLY", "BIWEEKLY", "MONTHLY_NTH_WEEKDAY"] as SeriesFrequency[]).map((f, i) => (
                    <span key={f}>
                      {i > 0 ? "; " : ""}
                      {describeRule({ frequency: f, dayOfWeek: 2, weekOfMonth: 1 })}
                    </span>
                  ))}
                  .
                </p>
                <ActionForm action={createHelpDaySeriesAction}>
                  <div className="grid gap-x-6 md:grid-cols-3">
                    <FSelect
                      id="series-frequency"
                      label="Repeats"
                      name="frequency"
                      required
                      defaultValue="MONTHLY_NTH_WEEKDAY"
                      options={[
                        { value: "WEEKLY", label: "Every week" },
                        { value: "BIWEEKLY", label: "Every other week" },
                        { value: "MONTHLY_NTH_WEEKDAY", label: "Monthly on a set weekday" },
                      ]}
                    />
                    <FSelect id="series-dayOfWeek" label="Day of the week" name="dayOfWeek" required defaultValue="2" options={WEEKDAY_NAMES.map((d, i) => ({ value: String(i), label: d }))} />
                    <FSelect
                      id="series-weekOfMonth"
                      label="Week of the month"
                      name="weekOfMonth"
                      defaultValue="1"
                      options={[1, 2, 3, 4, 5].map((w) => ({ value: String(w), label: WEEK_OF_MONTH_LABELS[w] }))}
                      hint="Monthly series only."
                    />
                    <FInput id="series-startDate" label="Starting on or after" name="startDate" type="date" required defaultValue={today} />
                    <FInput id="series-untilDate" label="Until" name="untilDate" type="date" />
                    <FInput id="series-count" label="Or number of dates" name="count" type="number" min={1} max={104} defaultValue="6" hint="Stops at whichever comes first." />
                  </div>
                  <HelpDayFields idPrefix="series" facilities={facOptions} technicians={techOptions} defaultFacilityId={sp.facilityId} tz={tz} withDate={false} />
                  <SubmitButton pendingText="Creating dates...">Create series</SubmitButton>
                </ActionForm>
              </Card>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

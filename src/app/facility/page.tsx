import Link from "next/link";
import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { requirePortalUser } from "@/lib/facilities/portal-session";
import { getPortalDashboard } from "@/lib/facilities/portal";
import { monthLabel } from "@/lib/facilities/billing";
import { ButtonLink, EmptyState, PageHeader, SectionTitle, Stat, Table, Td, Th } from "@/components/ui";
import { HelpDayList } from "./_components/HelpDayList";

export const metadata: Metadata = { title: "Overview" };

export default async function FacilityDashboard() {
  const { user } = await requirePortalUser("/facility");
  const [data, biz] = await Promise.all([getPortalDashboard(user.id), getSettings("business")]);
  const tz = biz.timeZone;
  const { totals, byMonth } = data.usage;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Community Portal"
        title={`Welcome, ${data.contact.name.split(" ")[0]}`}
        description={`Your Tech Help Day schedule and how residents at ${data.facility.name} are using it.`}
        actions={
          <>
            <ButtonLink href="/facility/materials" variant="outline">
              Print a flyer
            </ButtonLink>
            {data.contact.canRequestSessions && <ButtonLink href="/facility/request">Request more sessions</ButtonLink>}
          </>
        }
      />

      <section aria-labelledby="upcoming-heading">
        <SectionTitle id="upcoming-heading">Upcoming Tech Help Days</SectionTitle>
        {data.upcoming.length === 0 ? (
          <EmptyState title="No upcoming Tech Help Days">
            {data.contact.canRequestSessions ? <Link href="/facility/request">Request a date</Link> : "Please contact us to schedule one."}
          </EmptyState>
        ) : (
          <HelpDayList days={data.upcoming} tz={tz} caption="Upcoming Tech Help Days" />
        )}
        <p className="mt-2 text-sm">
          <Link href="/facility/schedule">See the full schedule</Link>
        </p>
      </section>

      <section aria-labelledby="usage-heading">
        <SectionTitle id="usage-heading">Resident usage</SectionTitle>
        <p className="mb-4 max-w-3xl text-[0.95rem]">
          Totals only. To protect residents&apos; privacy, we do not share who attended or what they needed help with.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Tech Help Days held" value={totals.helpDaysHeld} hint={`${totals.upcomingHelpDays} upcoming`} />
          <Stat label="Sessions completed" value={totals.sessionsCompleted} hint={`${totals.sessionsBooked} reserved ahead`} />
          <Stat label="Residents served" value={totals.residentsServed} />
          <Stat label="Hours of one-on-one help" value={totals.serviceHours} />
        </div>
        <div className="mt-4">
          <Table caption="Usage by month (last 6 months)">
            <thead>
              <tr>
                <Th>Month</Th>
                <Th className="text-right">Help days held</Th>
                <Th className="text-right">Sessions completed</Th>
                <Th className="text-right">Residents served</Th>
                <Th className="text-right">Hours</Th>
              </tr>
            </thead>
            <tbody>
              {[...byMonth].reverse().map((m) => (
                <tr key={m.monthKey}>
                  <Td>{monthLabel(m.monthKey)}</Td>
                  <Td className="text-right">{m.helpDaysHeld}</Td>
                  <Td className="text-right">{m.sessionsCompleted}</Td>
                  <Td className="text-right">{m.residentsServed}</Td>
                  <Td className="text-right">{m.serviceHours}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}

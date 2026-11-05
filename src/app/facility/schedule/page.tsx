import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { requirePortalUser } from "@/lib/facilities/portal-session";
import { listPortalHelpDays } from "@/lib/facilities/portal";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { HelpDayList } from "../_components/HelpDayList";

export const metadata: Metadata = { title: "Schedule" };

export default async function FacilitySchedulePage() {
  const { user } = await requirePortalUser("/facility/schedule");
  const [data, biz] = await Promise.all([listPortalHelpDays(user.id), getSettings("business")]);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Community Portal" title="Tech Help Day schedule" description={`All Tech Help Days at ${data.facility.name}.`} />
      <section>
        <SectionTitle>Upcoming</SectionTitle>
        {data.upcoming.length === 0 ? <EmptyState title="Nothing scheduled yet" /> : <HelpDayList days={data.upcoming} tz={biz.timeZone} caption="Upcoming Tech Help Days" />}
      </section>
      <section>
        <SectionTitle>Past</SectionTitle>
        {data.past.length === 0 ? <p>No past Tech Help Days yet.</p> : <HelpDayList days={data.past} tz={biz.timeZone} caption="Past Tech Help Days" showSignup={false} />}
      </section>
    </div>
  );
}

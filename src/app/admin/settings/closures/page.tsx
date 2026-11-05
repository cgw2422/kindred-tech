import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { toDateKey } from "@/lib/time";
import { findBlackoutConflicts } from "@/lib/admin/technicians";
import { ActionForm } from "../../_config/ActionForm";
import { BlackoutFields, BlackoutTable } from "../../_config/BlackoutFields";
import { SETTINGS_NAV, SubNav } from "../../_config/nav";
import { createClosureAction, deleteClosureAction } from "../actions";

export const metadata: Metadata = { title: "Holidays & Closures" };

export default async function ClosuresPage() {
  await requirePermission("settings:manage", "/admin/settings/closures");
  const tz = (await getSettings("business")).timeZone;
  const now = new Date();
  const closures = await prisma.blackout.findMany({ where: { technicianId: null, endsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 100 });
  const conflicts = Object.fromEntries(await Promise.all(closures.map(async (b) => [b.id, await findBlackoutConflicts(b.startsAt, b.endsAt, null)] as const)));
  return (
    <div>
      <PageHeader title="Settings" description="Holidays and days the whole business is closed. No one can book during these times." />
      <SubNav items={SETTINGS_NAV} current="/admin/settings/closures" label="Settings sections" />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <h2 className="mb-3 text-xl">Upcoming closures</h2>
          <BlackoutTable blackouts={closures} conflicts={conflicts} tz={tz} deleteAction={deleteClosureAction} />
          <p className="mt-3 text-sm text-body">Existing appointments are never moved automatically. Any that overlap a closure are listed so you can contact the customer and reschedule. Technician-specific time off is set on each technician&apos;s page.</p>
        </div>
        <Card>
          <h2 className="mb-3 text-xl">Add a holiday or closure</h2>
          <ActionForm action={createClosureAction}>
            <BlackoutFields
              todayKey={toDateKey(now, tz)}
              types={[
                { value: "HOLIDAY", label: "Holiday" },
                { value: "BLOCKED", label: "Blocked / closed" },
              ]}
            />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}

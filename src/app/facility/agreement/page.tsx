import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { requirePortalUser } from "@/lib/facilities/portal-session";
import { listPortalAgreements } from "@/lib/facilities/portal";
import { PARTNERSHIP_MODEL_LABELS } from "@/lib/facilities/facilities";
import { Badge, Card, DefinitionList, EmptyState, PageHeader } from "@/components/ui";
import { humanize } from "@/components/status";

export const metadata: Metadata = { title: "Agreement" };

export default async function FacilityAgreementPage() {
  const { user } = await requirePortalUser("/facility/agreement");
  const [data, biz] = await Promise.all([listPortalAgreements(user.id), getSettings("business")]);
  const tz = biz.timeZone;
  const d = (v: Date | null) => (v ? formatDate(v, tz, { weekday: undefined }) : "—");
  return (
    <div>
      <PageHeader eyebrow="Community Portal" title="Partnership agreement" description="Read-only. To make changes, please contact us." />
      {data.agreements.length === 0 ? (
        <EmptyState title="No agreement on file yet" />
      ) : (
        <div className="space-y-6">
          {data.agreements.map((a) => (
            <Card key={a.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-xl">{PARTNERSHIP_MODEL_LABELS[a.model]}</h2>
                <Badge tone={a.status === "ACTIVE" ? "green" : "neutral"}>{humanize(a.status)}</Badge>
              </div>
              <DefinitionList
                items={[
                  ["Start date", d(a.startDate)],
                  ["End date", d(a.endDate)],
                  ["Renewal date", a.renewalDate ? `${d(a.renewalDate)}${a.autoRenew ? " (renews automatically)" : ""}` : "—"],
                  ["Signed", d(a.signedAt)],
                  ...(a.monthlyFeeCents != null ? ([["Monthly fee", formatCents(a.monthlyFeeCents)]] as [string, string][]) : []),
                  ...(a.hoursPerMonth != null ? ([["Hours per month", String(a.hoursPerMonth)]] as [string, string][]) : []),
                  ...(a.sessionRateCents != null ? ([["Rate per sponsored Tech Help Day", formatCents(a.sessionRateCents)]] as [string, string][]) : []),
                  ...(a.residentRateCents != null ? ([["Resident session rate", formatCents(a.residentRateCents)]] as [string, string][]) : []),
                ]}
              />
              {a.terms && (
                <div className="mt-5">
                  <h3 className="mb-2 text-lg">Terms</h3>
                  <p className="whitespace-pre-line rounded-md bg-soft p-4">{a.terms}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

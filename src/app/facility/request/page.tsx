import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { requirePortalUser } from "@/lib/facilities/portal-session";
import { listPortalSessionRequests } from "@/lib/facilities/portal";
import { Badge, Card, Notice, PageHeader, SectionTitle, TextArea } from "@/components/ui";
import { PortalForm } from "../_components/PortalForm";
import { requestSessionsAction } from "./actions";

export const metadata: Metadata = { title: "Request sessions" };

const statusLabel: Record<string, string> = { OPEN: "Received", SCHEDULED: "Scheduled", DECLINED: "Not available", CLOSED: "Closed" };

export default async function FacilityRequestPage() {
  const { user, ctx } = await requirePortalUser("/facility/request");
  const [data, biz] = await Promise.all([listPortalSessionRequests(user.id), getSettings("business")]);
  return (
    <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
      <div>
        <PageHeader eyebrow="Community Portal" title="Request more sessions" description="Ask for an additional Tech Help Day or a change to your regular schedule." />
        <Card>
          {ctx.contact.canRequestSessions ? (
            <PortalForm action={requestSessionsAction} submitLabel="Send request" resetOnSuccess>
              <TextArea
                label="Preferred dates and times"
                name="preferredDates"
                required
                rows={3}
                maxLength={1000}
                placeholder="e.g. Any Tuesday afternoon in December, or the week of January 11"
              />
              <TextArea label="Anything else we should know" name="notes" rows={4} maxLength={4000} hint="For example, an event you are planning or topics residents are asking about. Please do not include residents' personal details." />
            </PortalForm>
          ) : (
            <Notice tone="neutral">Your account cannot request sessions online.{biz.phone ? ` Please call us at ${biz.phone}.` : " Please contact us."}</Notice>
          )}
        </Card>
      </div>
      <section>
        <SectionTitle>Your requests</SectionTitle>
        {data.requests.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{formatDateTime(r.createdAt, biz.timeZone)}</span>
                  <Badge tone={r.status === "OPEN" ? "warn" : r.status === "SCHEDULED" ? "green" : "neutral"}>{statusLabel[r.status] ?? r.status}</Badge>
                </div>
                <p className="mt-2">{r.preferredDates}</p>
                {r.notes && <p className="mt-1 whitespace-pre-line text-sm">{r.notes}</p>}
                <p className="mt-1 text-sm">Requested by {r.requestedByName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

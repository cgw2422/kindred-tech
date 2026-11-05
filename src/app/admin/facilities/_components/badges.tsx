import type { HelpDayStatus, PartnershipStatus } from "@prisma/client";
import { Badge, type Tone } from "@/components/ui";
import { PARTNERSHIP_STATUS_LABELS } from "@/lib/facilities/facilities";

const statusTone: Record<PartnershipStatus, Tone> = { LEAD: "warn", CONTACTED: "navy", PROPOSAL_SENT: "navy", ACTIVE: "green", PAUSED: "neutral", ENDED: "neutral" };

export function PartnershipBadge({ status }: { status: PartnershipStatus }) {
  return <Badge tone={statusTone[status]}>{PARTNERSHIP_STATUS_LABELS[status]}</Badge>;
}

const helpDayTone: Record<HelpDayStatus, Tone> = { SCHEDULED: "warn", CONFIRMED: "green", COMPLETED: "neutral", CANCELED: "danger" };
const helpDayLabel: Record<HelpDayStatus, string> = { SCHEDULED: "Scheduled", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELED: "Canceled" };

export function HelpDayStatusBadge({ status }: { status: HelpDayStatus }) {
  return <Badge tone={helpDayTone[status]}>{helpDayLabel[status]}</Badge>;
}

import type { PortalHelpDay } from "@/lib/facilities/portal";
import { formatDate, formatTime } from "@/lib/time";
import { Badge, Table, Td, Th, type Tone } from "@/components/ui";
import { HELP_DAY_PAYMENT_LABELS } from "@/lib/facilities/help-days";

const tone: Record<string, Tone> = { SCHEDULED: "warn", CONFIRMED: "green", COMPLETED: "neutral", CANCELED: "danger" };
const label: Record<string, string> = { SCHEDULED: "Scheduled", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELED: "Canceled" };

/** Facility-safe help day table: times, status and slot counts only. */
export function HelpDayList({ days, tz, caption, showSignup = true }: { days: PortalHelpDay[]; tz: string; caption: string; showSignup?: boolean }) {
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Time</Th>
          <Th>Location</Th>
          <Th>Status</Th>
          <Th>Payment</Th>
          <Th className="text-right">Sessions reserved</Th>
          {showSignup && <Th>Resident sign-up</Th>}
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.id}>
            <Td className="font-semibold text-navy">{formatDate(d.startsAt, tz, { weekday: "short", month: "short" })}</Td>
            <Td className="whitespace-nowrap">
              {formatTime(d.startsAt, tz)}–{formatTime(d.endsAt, tz)}
            </Td>
            <Td>{d.location ?? "—"}</Td>
            <Td>
              <Badge tone={tone[d.status] ?? "neutral"}>{label[d.status] ?? d.status}</Badge>
            </Td>
            <Td>{HELP_DAY_PAYMENT_LABELS[d.paymentModel as keyof typeof HELP_DAY_PAYMENT_LABELS] ?? d.paymentModel}</Td>
            <Td className="text-right">
              {d.bookedSlots} of {d.totalSlots}
            </Td>
            {showSignup && (
              <Td>
                {d.signupUrl ? (
                  <a href={d.signupUrl} target="_blank" rel="noopener">
                    Open sign-up page
                  </a>
                ) : (
                  "—"
                )}
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

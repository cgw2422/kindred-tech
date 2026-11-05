import Link from "next/link";
import type { Blackout } from "@prisma/client";
import {
  Badge,
  Checkbox,
  EmptyState,
  Select,
  Table,
  Td,
  TextInput,
  Th,
} from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/forms";
import type { BlackoutConflict } from "@/lib/admin/technicians";
import { formatDate, formatDateTime, formatTime, toDateKey } from "@/lib/time";
import { RowAction } from "./RowAction";

/** Fields for creating a blackout. All-day converts business dates to local midnight-to-midnight. */
export function BlackoutFields({
  types,
  todayKey,
}: {
  types: { value: string; label: string }[];
  todayKey: string;
}) {
  return (
    <>
      <Select
        label="Type"
        name="type"
        required
        options={types}
        defaultValue={types[0]?.value}
      />
      <div className="grid grid-cols-2 gap-x-4">
        <TextInput
          label="Start date"
          name="startDate"
          type="date"
          required
          defaultValue={todayKey}
        />
        <TextInput label="End date" name="endDate" type="date" />
      </div>
      <Checkbox
        name="allDay"
        label="All day"
        hint="Blocks from midnight at the start of the first day until midnight after the last day (business time zone)."
        defaultChecked
      />
      <p className="mb-2 text-sm text-body">
        Leave the end date blank for a single day. Times are only used when
        &quot;All day&quot; is unchecked.
      </p>
      <div className="grid grid-cols-2 gap-x-4">
        <TextInput label="Start time" name="startTime" type="time" step={900} />
        <TextInput label="End time" name="endTime" type="time" step={900} />
      </div>
      <TextInput
        label="Reason"
        name="reason"
        maxLength={300}
        hint="Shown to staff only, e.g. Thanksgiving, dentist appointment."
      />
      <SubmitButton>Save</SubmitButton>
    </>
  );
}

const typeLabel: Record<string, string> = {
  HOLIDAY: "Holiday",
  BLOCKED: "Blocked",
  TIME_OFF: "Time off",
};

function isAllDay(b: Blackout, tz: string) {
  const s = formatTime(b.startsAt, tz);
  const e = formatTime(b.endsAt, tz);
  return s === "12:00 AM" && e === "12:00 AM";
}

export function describeBlackout(b: Blackout, tz: string): string {
  if (isAllDay(b, tz)) {
    const first = toDateKey(b.startsAt, tz);
    const last = toDateKey(new Date(b.endsAt.getTime() - 1), tz);
    const opts = { weekday: "short", month: "short" } as const;
    return first === last
      ? `${formatDate(b.startsAt, tz, opts)} (all day)`
      : `${formatDate(b.startsAt, tz, opts)} – ${formatDate(new Date(b.endsAt.getTime() - 1), tz, opts)} (all day)`;
  }
  return `${formatDateTime(b.startsAt, tz)} – ${formatDateTime(b.endsAt, tz)}`;
}

export function BlackoutTable({
  blackouts,
  conflicts,
  tz,
  deleteAction,
  extra,
}: {
  blackouts: Blackout[];
  conflicts: Record<string, BlackoutConflict[]>;
  tz: string;
  deleteAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  extra?: Record<string, string>;
}) {
  if (blackouts.length === 0)
    return (
      <div className="self-start">
        <EmptyState title="Nothing scheduled" />
      </div>
    );
  return (
    <Table caption="Blocked time">
      <thead>
        <tr>
          <Th>When</Th>
          <Th>Type</Th>
          <Th>Reason</Th>
          <Th>Affected appointments</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {blackouts.map((b) => {
          const c = conflicts[b.id] ?? [];
          return (
            <tr key={b.id}>
              <Td>{describeBlackout(b, tz)}</Td>
              <Td>
                <Badge tone={b.type === "HOLIDAY" ? "navy" : "neutral"}>
                  {typeLabel[b.type] ?? b.type}
                </Badge>
              </Td>
              <Td>{b.reason ?? "—"}</Td>
              <Td>
                {c.length === 0 ? (
                  <span className="text-body">None</span>
                ) : (
                  <div>
                    <Badge tone="danger">{c.length} need rescheduling</Badge>
                    <ul className="mt-1 text-sm">
                      {c.slice(0, 8).map((a) => (
                        <li key={a.id}>
                          <Link href={`/admin/appointments/${a.id}`}>
                            {formatDateTime(a.startsAt, tz)} — {a.customerName}
                          </Link>
                        </li>
                      ))}
                      {c.length > 8 && <li>and {c.length - 8} more</li>}
                    </ul>
                  </div>
                )}
              </Td>
              <Td>
                <RowAction
                  action={deleteAction}
                  id={b.id}
                  label="Remove"
                  variant="ghost"
                  confirm="Remove this blocked time?"
                  extra={extra}
                />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

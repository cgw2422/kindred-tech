import type { TechHelpDay } from "@prisma/client";
import { centsToDollarString } from "@/lib/money";
import { toDateKey, zonedParts } from "@/lib/time";
import { HELP_DAY_PAYMENT_LABELS } from "@/lib/facilities/help-days";
import { FCheckbox, FInput, FSelect, FTextArea } from "../../facilities/_components/fields";

type Option = { id: string; name: string };

const DURATIONS = [60, 90, 120, 150, 180, 210, 240, 300, 360, 420, 480];

function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Shared fields for creating/editing a help day. `withDate` adds the single-day date field. */
export function HelpDayFields({
  idPrefix,
  facilities,
  technicians,
  day,
  defaultFacilityId,
  tz,
  withDate,
}: {
  idPrefix: string;
  facilities?: Option[];
  technicians: Option[];
  day?: TechHelpDay | null;
  defaultFacilityId?: string;
  tz: string;
  withDate: boolean;
}) {
  const n = (k: string) => `${idPrefix}-${k}`;
  const start = day ? zonedParts(day.startsAt, tz) : null;
  const duration = day ? Math.round((day.endsAt.getTime() - day.startsAt.getTime()) / 60_000) : 180;
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);
  return (
    <>
      <div className="grid gap-x-6 md:grid-cols-2">
        {facilities && (
          <FSelect
            id={n("facilityId")}
            label="Community"
            name="facilityId"
            required
            defaultValue={defaultFacilityId ?? ""}
            placeholder="Choose a community"
            options={facilities.map((f) => ({ value: f.id, label: f.name }))}
          />
        )}
        <FSelect
          id={n("technicianId")}
          label="Technician"
          name="technicianId"
          defaultValue={day ? (day.technicianId ?? "") : (technicians[0]?.id ?? "")}
          placeholder="Unassigned"
          options={technicians.map((t) => ({ value: t.id, label: t.name }))}
          hint="The technician is reserved for the whole Tech Help Day."
        />
        {withDate && <FInput id={n("date")} label="Date" name="date" type="date" required defaultValue={day ? toDateKey(day.startsAt, tz) : ""} />}
        <FInput id={n("startTime")} label="Start time" name="startTime" type="time" required step={300} defaultValue={start ? hhmm(start.hour * 60 + start.minute) : "13:00"} />
        <FSelect
          id={n("durationMinutes")}
          label="Length"
          name="durationMinutes"
          required
          defaultValue={String(duration)}
          options={durations.map((m) => ({ value: String(m), label: `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` }))}
        />
        <FInput id={n("location")} label="Location in the community" name="location" defaultValue={day?.location ?? ""} placeholder="e.g. Community Room" maxLength={200} />
        <FSelect
          id={n("slotMinutes")}
          label="Resident session length"
          name="slotMinutes"
          defaultValue={String(day?.slotMinutes ?? 30)}
          options={[15, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} minutes` }))}
        />
        <FSelect
          id={n("slotBufferMinutes")}
          label="Break between sessions"
          name="slotBufferMinutes"
          defaultValue={String(day?.slotBufferMinutes ?? 0)}
          options={[0, 5, 10, 15].map((m) => ({ value: String(m), label: m ? `${m} minutes` : "None" }))}
        />
      </div>
      <fieldset className="mb-4 rounded-md border border-line p-4">
        <legend className="px-1 font-bold text-navy">Who pays</legend>
        <div className="grid gap-x-6 md:grid-cols-3">
          <FSelect
            id={n("paymentModel")}
            label="Payment model"
            name="paymentModel"
            required
            defaultValue={day?.paymentModel ?? "RESIDENT_PAID"}
            options={(Object.keys(HELP_DAY_PAYMENT_LABELS) as (keyof typeof HELP_DAY_PAYMENT_LABELS)[]).map((k) => ({ value: k, label: HELP_DAY_PAYMENT_LABELS[k] }))}
            hint="Sponsored and contract days are free to residents."
          />
          <FInput
            id={n("residentPrice")}
            label="Resident price ($)"
            name="residentPrice"
            inputMode="decimal"
            defaultValue={centsToDollarString(day?.residentPriceCents)}
            hint="Resident-paid days. Blank uses the community rate, then the standard price."
          />
          <FInput
            id={n("sponsoredPrice")}
            label="Sponsored price ($)"
            name="sponsoredPrice"
            inputMode="decimal"
            defaultValue={centsToDollarString(day?.sponsoredPriceCents)}
            hint="Billed to the community. Blank uses the agreement's session rate."
          />
        </div>
      </fieldset>
      <FTextArea id={n("notes")} label="Staff notes" name="notes" rows={2} defaultValue={day?.notes ?? ""} />
      <FCheckbox id={n("allowOutsideSchedule")} name="allowOutsideSchedule" label="Allow outside the technician's regular working hours" hint="Appointments, other help days and time off are always checked." />
    </>
  );
}

import type { Facility } from "@prisma/client";
import { Select, TextInput } from "@/components/ui";
import { humanize } from "@/components/status";
import { centsToDollarString } from "@/lib/money";
import { FACILITY_TYPES, PARTNERSHIP_MODELS, PARTNERSHIP_MODEL_LABELS, PARTNERSHIP_STATUSES, PARTNERSHIP_STATUS_LABELS } from "@/lib/facilities/facilities";

export function FacilityFields({ facility }: { facility?: Facility | null }) {
  const f = facility;
  return (
    <>
      <div className="grid gap-x-6 md:grid-cols-2">
        <TextInput label="Community name" name="name" required defaultValue={f?.name} maxLength={200} />
        <Select label="Type" name="type" required defaultValue={f?.type ?? "INDEPENDENT_LIVING"} options={FACILITY_TYPES.map((t) => ({ value: t, label: humanize(t) }))} />
        <Select
          label="Partnership status"
          name="partnershipStatus"
          required
          defaultValue={f?.partnershipStatus ?? "LEAD"}
          options={PARTNERSHIP_STATUSES.map((s) => ({ value: s, label: PARTNERSHIP_STATUS_LABELS[s] }))}
        />
        <Select
          label="Partnership model"
          name="partnershipModel"
          defaultValue={f?.partnershipModel ?? ""}
          placeholder="Not decided yet"
          options={PARTNERSHIP_MODELS.map((m) => ({ value: m, label: PARTNERSHIP_MODEL_LABELS[m] }))}
        />
        <TextInput
          label="Resident rate for this community ($)"
          name="residentRate"
          inputMode="decimal"
          defaultValue={centsToDollarString(f?.residentRateCents)}
          hint="Overrides the standard Tech Help Day session price for residents. Leave blank to use the standard price."
        />
        <TextInput label="Approximate number of residents" name="residentCount" type="number" min={0} defaultValue={f?.residentCount ?? ""} />
      </div>
      <fieldset className="mb-4 rounded-md border border-line p-4">
        <legend className="px-1 font-bold text-navy">Address and contact</legend>
        <div className="grid gap-x-6 md:grid-cols-2">
          <TextInput label="Street address" name="line1" defaultValue={f?.line1 ?? ""} autoComplete="off" />
          <TextInput label="Address line 2" name="line2" defaultValue={f?.line2 ?? ""} autoComplete="off" />
          <TextInput label="City" name="city" defaultValue={f?.city ?? ""} />
          <div className="grid grid-cols-2 gap-x-4">
            <TextInput label="State" name="state" defaultValue={f?.state ?? "OH"} maxLength={2} />
            <TextInput label="ZIP" name="postalCode" defaultValue={f?.postalCode ?? ""} maxLength={10} />
          </div>
          <TextInput label="County" name="county" defaultValue={f?.county ?? ""} />
          <TextInput label="Main phone" name="phone" type="tel" defaultValue={f?.phone ?? ""} />
          <TextInput label="Main email" name="email" type="email" defaultValue={f?.email ?? ""} />
          <TextInput label="Website" name="website" defaultValue={f?.website ?? ""} />
        </div>
      </fieldset>
    </>
  );
}

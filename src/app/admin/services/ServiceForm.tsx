import type { Service, ServiceCategory } from "@prisma/client";
import { Checkbox, Select, TextArea, TextInput } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { centsToDollarString } from "@/lib/money";
import { ActionForm } from "../_config/ActionForm";
import { saveServiceAction } from "./actions";

export function ServiceForm({ service, categories }: { service?: Service | null; categories: ServiceCategory[] }) {
  const s = service;
  return (
    <ActionForm action={saveServiceAction}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-x-6 md:grid-cols-2">
        <TextInput label="Service name" name="name" required defaultValue={s?.name} maxLength={120} />
        <TextInput label="Slug (web address)" name="slug" required defaultValue={s?.slug} hint="Lowercase words joined by dashes, e.g. in-home-support." maxLength={80} />
        <Select
          label="Category"
          name="categoryId"
          defaultValue={s?.categoryId ?? ""}
          placeholder="No category"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <TextInput label="Sort order" name="sortOrder" type="number" defaultValue={s?.sortOrder ?? 0} hint="Lower numbers are listed first." />
      </div>
      <TextInput label="Short description" name="shortDescription" required defaultValue={s?.shortDescription} maxLength={300} hint="One sentence shown on service cards." />
      <TextArea label="Full description" name="description" defaultValue={s?.description} rows={5} />

      <fieldset className="mb-4 rounded-md border border-line p-4">
        <legend className="px-1 font-bold text-navy">Pricing and time</legend>
        <div className="grid gap-x-6 md:grid-cols-3">
          <Select
            label="Pricing type"
            name="pricingType"
            required
            defaultValue={s?.pricingType ?? "FIXED"}
            options={[
              { value: "FIXED", label: "Fixed price" },
              { value: "STARTING_AT", label: "Starting at" },
              { value: "CUSTOM_QUOTE", label: "Custom quote" },
            ]}
          />
          <TextInput label="Price ($)" name="price" required inputMode="decimal" defaultValue={s ? centsToDollarString(s.basePriceCents) : ""} hint="Enter 0 for custom quotes." />
          <TextInput label="Duration (minutes)" name="durationMinutes" required type="number" min={15} step={5} defaultValue={s?.durationMinutes ?? 60} />
          <TextInput label="Extension block (minutes)" name="extensionMinutes" type="number" min={5} step={5} defaultValue={s?.extensionMinutes ?? ""} hint="Extra time customers can add." />
          <TextInput label="Extension price ($)" name="extensionPrice" inputMode="decimal" defaultValue={s?.extensionPriceCents != null ? centsToDollarString(s.extensionPriceCents) : ""} />
        </div>
      </fieldset>

      <fieldset className="mb-4 rounded-md border border-line p-4">
        <legend className="px-1 font-bold text-navy">Options</legend>
        <div className="grid gap-x-6 md:grid-cols-2">
          <Checkbox name="isActive" label="Active" hint="Inactive services are hidden everywhere." defaultChecked={s?.isActive ?? true} />
          <Checkbox name="isBookableOnline" label="Bookable online" hint="Customers can pick it on the scheduling page." defaultChecked={s?.isBookableOnline ?? true} />
          <Checkbox name="requiresApproval" label="Requires staff approval" hint="Online requests wait for confirmation." defaultChecked={s?.requiresApproval ?? true} />
          <Checkbox name="isRemote" label="Remote service" hint="No home visit or address needed." defaultChecked={s?.isRemote ?? false} />
          <Checkbox name="memberDiscountEligible" label="Member discount applies" defaultChecked={s?.memberDiscountEligible ?? true} />
        </div>
      </fieldset>
      <SubmitButton size="lg">{s ? "Save changes" : "Create service"}</SubmitButton>
    </ActionForm>
  );
}

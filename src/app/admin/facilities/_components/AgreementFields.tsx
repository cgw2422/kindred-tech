import type { FacilityAgreement } from "@prisma/client";
import { humanize } from "@/components/status";
import { centsToDollarString } from "@/lib/money";
import { toDateKey } from "@/lib/time";
import { AGREEMENT_STATUSES, PARTNERSHIP_MODELS, PARTNERSHIP_MODEL_LABELS } from "@/lib/facilities/facilities";
import { FCheckbox, FInput, FSelect, FTextArea } from "./fields";

export function AgreementFields({ agreement, tz, idPrefix }: { agreement?: FacilityAgreement | null; tz: string; idPrefix: string }) {
  const a = agreement;
  const d = (v: Date | null | undefined) => (v ? toDateKey(v, tz) : "");
  const n = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      <div className="grid gap-x-6 md:grid-cols-3">
        <FSelect label="Model" name="model" id={n("model")} required defaultValue={a?.model ?? "RESIDENT_PAID_DAY"} options={PARTNERSHIP_MODELS.map((m) => ({ value: m, label: PARTNERSHIP_MODEL_LABELS[m] }))} />
        <FSelect label="Status" name="status" id={n("status")} required defaultValue={a?.status ?? "DRAFT"} options={AGREEMENT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        <FInput label="Signed on" name="signedAt" id={n("signedAt")} type="date" defaultValue={d(a?.signedAt)} />
        <FInput label="Start date" name="startDate" id={n("startDate")} type="date" defaultValue={d(a?.startDate)} />
        <FInput label="End date" name="endDate" id={n("endDate")} type="date" defaultValue={d(a?.endDate)} />
        <FInput label="Renewal date" name="renewalDate" id={n("renewalDate")} type="date" defaultValue={d(a?.renewalDate)} hint="Contacts get a reminder 30 days before." />
        <FInput label="Monthly fee ($)" name="monthlyFee" id={n("monthlyFee")} inputMode="decimal" defaultValue={centsToDollarString(a?.monthlyFeeCents)} hint="Recurring contracts." />
        <FInput label="Session rate ($)" name="sessionRate" id={n("sessionRate")} inputMode="decimal" defaultValue={centsToDollarString(a?.sessionRateCents)} hint="Per sponsored Tech Help Day." />
        <FInput label="Resident rate ($)" name="residentRate" id={n("residentRate")} inputMode="decimal" defaultValue={centsToDollarString(a?.residentRateCents)} hint="Per resident session." />
        <FInput label="Hours per month" name="hoursPerMonth" id={n("hoursPerMonth")} type="number" min={0} defaultValue={a?.hoursPerMonth ?? ""} />
      </div>
      <FCheckbox label="Renews automatically" name="autoRenew" id={n("autoRenew")} defaultChecked={a?.autoRenew ?? false} />
      <FTextArea label="Terms" name="terms" id={n("terms")} rows={4} defaultValue={a?.terms ?? ""} hint="Visible to the community's portal contacts once the agreement is no longer a draft." />
    </>
  );
}

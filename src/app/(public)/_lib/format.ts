import { formatCents } from "@/lib/money";

export type PricedService = {
  pricingType: "FIXED" | "STARTING_AT" | "CUSTOM_QUOTE";
  basePriceCents: number;
  extensionMinutes?: number | null;
  extensionPriceCents?: number | null;
};

/** Human price label for a service: "$99", "Starting at $149", or "Custom pricing". */
export function servicePriceLabel(s: PricedService): string {
  if (s.pricingType === "CUSTOM_QUOTE") return "Custom pricing";
  const amount = formatCents(s.basePriceCents);
  return s.pricingType === "STARTING_AT" ? `Starting at ${amount}` : amount;
}

/** "Additional 30 minutes: $40", or null when the service has no extension pricing. */
export function extensionLabel(s: PricedService): string | null {
  if (!s.extensionMinutes || s.extensionPriceCents == null) return null;
  return `Additional ${s.extensionMinutes} minutes: ${formatCents(s.extensionPriceCents)}`;
}

/** "60 minutes", "90 minutes", "2 hours", "1 hour 30 minutes". */
export function durationLabel(minutes: number): string {
  if (minutes < 60 || minutes % 30 !== 0 || minutes === 90) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return m ? `${hours} ${m} minutes` : hours;
}

/** Digits-only tel: href ("+" preserved). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Joins a list as "a, b, and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Summarizes travel fees across areas for public copy. */
export function travelFeeSummary(fees: number[]): string {
  const positive = fees.filter((f) => f > 0);
  if (fees.length === 0 || positive.length === 0) return "There is no travel fee for visits within our service area.";
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  const someFree = positive.length < fees.length;
  const range = min === max ? formatCents(min) : `${formatCents(min)} to ${formatCents(max)}`;
  return someFree
    ? `Most visits have no travel fee. Some parts of our service area have a travel fee of ${range}, which is always shown before you confirm.`
    : `A travel fee of ${range} applies to in-home visits and is always shown before you confirm.`;
}

/** Values echoed back to a form after a failed submission (React resets uncontrolled forms). */
export function echoValues(raw: Record<string, string>, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = (raw[k] ?? "").slice(0, 5000);
  return out;
}

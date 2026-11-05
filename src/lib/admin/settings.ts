import { z } from "zod";
import { audit } from "@/lib/audit";
import { saveSettings, settingsSchemas, type Settings, type SettingsKey } from "@/lib/settings";
import { parseDollarsToCents } from "@/lib/money";
import { AdminError, assertCan, parseTimeToMinutes, type Actor } from "./common";

/** Human-readable labels for settings fields, used in validation messages and the UI. */
export const SETTING_LABELS: Record<string, string> = {
  name: "Business name",
  tagline: "Tagline",
  secondaryTagline: "Secondary tagline",
  phone: "Phone",
  email: "Email",
  addressLine: "Street address",
  city: "City",
  state: "State",
  postalCode: "ZIP code",
  hoursDescription: "Hours description",
  timeZone: "Time zone",
  logoUrl: "Logo URL",
  minNoticeHours: "Minimum notice (hours)",
  maxDaysAhead: "Maximum days ahead",
  slotIntervalMinutes: "Slot interval (minutes)",
  travelBufferMinutes: "Travel buffer (minutes)",
  remoteBufferMinutes: "Remote buffer (minutes)",
  freeCancellationHours: "Free cancellation window (hours)",
  lateCancellationFeeCents: "Late cancellation fee",
  policyText: "Policy text",
  invoiceDueDays: "Invoice due (days)",
  taxRatePercent: "Tax rate (%)",
  defaultTravelFeeCents: "Default travel fee",
  depositPercent: "Deposit (%)",
  adminNotificationEmail: "Admin notification email",
  reminderHoursBefore: "Reminder hours before",
  reviewUrl: "Review URL",
  communicationRetentionDays: "Communication retention (days)",
  auditRetentionDays: "Audit log retention (days)",
  jobRetentionDays: "Background job retention (days)",
};

const BOOL_FIELDS: Record<SettingsKey, string[]> = {
  business: ["showAddressPublicly"],
  hours: [],
  booking: ["requireApprovalByDefault", "allowOutOfAreaRequests"],
  cancellation: ["allowOnlineReschedule"],
  billing: [],
  notifications: ["sendBookingReceived", "sendReminders", "sendReviewRequests"],
  privacy: [],
};
const MONEY_FIELDS = new Set(["lateCancellationFeeCents", "defaultTravelFeeCents"]);

function num(raw: string | undefined): number {
  const s = (raw ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/**
 * Converts flat form fields (strings, checkbox "on") into the typed shape for a
 * settings key. Money fields are entered in dollars; hours use HH:MM inputs.
 */
export function settingsFromForm(key: SettingsKey, form: Record<string, string>): unknown {
  if (key === "hours") {
    return {
      days: Array.from({ length: 7 }, (_, d) => {
        const open = form[`d${d}_open`] === "on" || form[`d${d}_open`] === "true";
        const start = parseTimeToMinutes(form[`d${d}_start`] ?? "") ?? (open ? NaN : 9 * 60);
        const endRaw = form[`d${d}_end`] ?? "";
        const end = (endRaw === "23:59" ? 1440 : parseTimeToMinutes(endRaw)) ?? (open ? NaN : 17 * 60);
        return { open, startMinute: start, endMinute: end };
      }),
    };
  }
  const shape = settingsSchemas[key].shape as Record<string, z.ZodType>;
  const out: Record<string, unknown> = {};
  for (const field of Object.keys(shape)) {
    const raw = form[field];
    if (BOOL_FIELDS[key].includes(field)) out[field] = raw === "on" || raw === "true";
    else if (MONEY_FIELDS.has(field)) out[field] = parseDollarsToCents(raw ?? "") ?? NaN;
    else if (shape[field] instanceof z.ZodNumber) out[field] = num(raw);
    else out[field] = (raw ?? "").trim();
  }
  return out;
}

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const okUrl = (v: string) => v === "" || /^https:\/\/[^\s]+$/i.test(v) || /^http:\/\/localhost[^\s]*$/i.test(v) || /^\/[^\s/][^\s]*$/.test(v);
const okEmail = (v: string) => v === "" || z.email().safeParse(v).success;

/** Rules beyond the base schema (cross-field and format checks). */
function extraProblems(key: SettingsKey, value: Record<string, unknown>): Record<string, string> {
  const p: Record<string, string> = {};
  if (key === "business") {
    if (!isValidTimeZone(String(value.timeZone))) p.timeZone = "Time zone must be a valid IANA zone such as America/New_York.";
    if (!okEmail(String(value.email))) p.email = "Email must be a valid email address.";
    if (!okUrl(String(value.logoUrl))) p.logoUrl = "Logo URL must start with https:// or /.";
    if (String(value.state).length > 2) p.state = "State must be a 2-letter abbreviation.";
  }
  if (key === "notifications") {
    if (!okEmail(String(value.adminNotificationEmail))) p.adminNotificationEmail = "Admin notification email must be a valid email address.";
    if (!okUrl(String(value.reviewUrl))) p.reviewUrl = "Review URL must start with https://.";
  }
  if (key === "hours") {
    const days = (value.days as Settings<"hours">["days"]) ?? [];
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    days.forEach((d, i) => {
      if (d.open && !(d.startMinute < d.endMinute)) p[`days.${i}`] = `${names[i]}: opening time must be before closing time.`;
    });
  }
  if (key === "booking" && Number(value.slotIntervalMinutes) % 5 !== 0) p.slotIntervalMinutes = "Slot interval must be a multiple of 5 minutes.";
  return p;
}

/** Validates (schema + extra rules) without saving. Throws AdminError with labeled messages. */
export function validateSettings<K extends SettingsKey>(key: K, value: unknown): Settings<K> {
  const parsed = settingsSchemas[key].safeParse(value);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      const field = String(issue.path[0] ?? "");
      if (fieldErrors[path]) continue;
      const label = SETTING_LABELS[field] ?? (key === "hours" ? "Business hours" : field);
      const money = MONEY_FIELDS.has(field);
      const scale = (n: unknown) => (money ? `$${(Number(n) / 100).toFixed(2)}` : String(n));
      let msg = `${label} has an invalid value.`;
      if (issue.code === "too_small") msg = `${label} must be at least ${scale((issue as { minimum?: unknown }).minimum)}.`;
      else if (issue.code === "too_big") msg = `${label} must be at most ${scale((issue as { maximum?: unknown }).maximum)}.`;
      else if (issue.code === "invalid_type")
        msg = money ? `${label} must be a dollar amount.` : (issue as { expected?: string }).expected === "int" ? `${label} must be a whole number.` : `${label} must be a number.`;
      if (key === "hours") msg = "Business hours: please enter valid opening and closing times for each open day.";
      fieldErrors[path] = msg;
    }
  } else {
    Object.assign(fieldErrors, extraProblems(key, parsed.data as Record<string, unknown>));
  }
  if (Object.keys(fieldErrors).length) throw new AdminError(Object.values(fieldErrors).join(" "), fieldErrors);
  return parsed.data as Settings<K>;
}

export async function saveSettingsSection<K extends SettingsKey>(actor: Actor, key: K, value: unknown): Promise<Settings<K>> {
  assertCan(actor, "settings:manage");
  const valid = validateSettings(key, value);
  const saved = await saveSettings(key, valid);
  await audit({ actorUserId: actor.id, action: "settings.update", entityType: "Setting", entityId: key, metadata: { key } });
  return saved;
}

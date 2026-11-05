import { z } from "zod";
import { prisma } from "./db";

/**
 * Typed, admin-editable settings stored in the Setting table (key -> JSON).
 * Defaults are used when nothing has been saved. Defaults intentionally do NOT
 * contain invented phone numbers or addresses — those must be entered by the owner.
 */

const dayHours = z.object({ open: z.boolean(), startMinute: z.number().int().min(0).max(1440), endMinute: z.number().int().min(0).max(1440) });

export const settingsSchemas = {
  business: z.object({
    name: z.string().min(1),
    tagline: z.string(),
    secondaryTagline: z.string(),
    phone: z.string(),
    email: z.string(),
    addressLine: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    showAddressPublicly: z.boolean(),
    hoursDescription: z.string(),
    timeZone: z.string(),
    logoUrl: z.string(),
  }),
  hours: z.object({ days: z.array(dayHours).length(7) }),
  booking: z.object({
    minNoticeHours: z.number().int().min(0).max(24 * 30),
    maxDaysAhead: z.number().int().min(1).max(365),
    slotIntervalMinutes: z.number().int().min(5).max(240),
    travelBufferMinutes: z.number().int().min(0).max(240),
    remoteBufferMinutes: z.number().int().min(0).max(120),
    requireApprovalByDefault: z.boolean(),
    allowOutOfAreaRequests: z.boolean(),
  }),
  cancellation: z.object({
    freeCancellationHours: z.number().int().min(0).max(24 * 14),
    lateCancellationFeeCents: z.number().int().min(0),
    allowOnlineReschedule: z.boolean(),
    policyText: z.string(),
  }),
  billing: z.object({
    invoiceDueDays: z.number().int().min(0).max(120),
    taxRatePercent: z.number().min(0).max(25),
    defaultTravelFeeCents: z.number().int().min(0),
    depositPercent: z.number().int().min(0).max(100),
  }),
  notifications: z.object({
    adminNotificationEmail: z.string(),
    sendBookingReceived: z.boolean(),
    sendReminders: z.boolean(),
    reminderHoursBefore: z.number().int().min(1).max(168),
    sendReviewRequests: z.boolean(),
    reviewUrl: z.string(),
  }),
  privacy: z.object({
    communicationRetentionDays: z.number().int().min(30).max(3650),
    auditRetentionDays: z.number().int().min(90).max(3650),
    jobRetentionDays: z.number().int().min(7).max(365),
  }),
};

export type SettingsKey = keyof typeof settingsSchemas;
export type Settings<K extends SettingsKey> = z.infer<(typeof settingsSchemas)[K]>;

const weekday = { open: true, startMinute: 9 * 60, endMinute: 17 * 60 };
const closed = { open: false, startMinute: 9 * 60, endMinute: 17 * 60 };

export const settingsDefaults: { [K in SettingsKey]: Settings<K> } = {
  business: {
    name: "Kindred Tech Support",
    tagline: "Modern Technology. Old-Fashioned Service.",
    secondaryTagline: "Technology Help With a Personal Touch.",
    phone: "",
    email: "",
    addressLine: "",
    city: "New Philadelphia",
    state: "OH",
    postalCode: "",
    showAddressPublicly: false,
    hoursDescription: "Monday through Friday, 9:00 AM to 5:00 PM. Saturday by appointment.",
    timeZone: "America/New_York",
    logoUrl: "",
  },
  hours: { days: [closed, weekday, weekday, weekday, weekday, weekday, { open: true, startMinute: 10 * 60, endMinute: 14 * 60 }] },
  booking: {
    minNoticeHours: 24,
    maxDaysAhead: 60,
    slotIntervalMinutes: 30,
    travelBufferMinutes: 30,
    remoteBufferMinutes: 10,
    requireApprovalByDefault: true,
    allowOutOfAreaRequests: true,
  },
  cancellation: {
    freeCancellationHours: 24,
    lateCancellationFeeCents: 0,
    allowOnlineReschedule: true,
    policyText:
      "You may reschedule or cancel at no charge up to 24 hours before your appointment. For changes within 24 hours, please call us and we will do our best to help.",
  },
  billing: { invoiceDueDays: 14, taxRatePercent: 0, defaultTravelFeeCents: 0, depositPercent: 0 },
  notifications: {
    adminNotificationEmail: "",
    sendBookingReceived: true,
    sendReminders: true,
    reminderHoursBefore: 24,
    sendReviewRequests: false,
    reviewUrl: "",
  },
  privacy: { communicationRetentionDays: 1095, auditRetentionDays: 1095, jobRetentionDays: 30 },
};

export async function getSettings<K extends SettingsKey>(key: K): Promise<Settings<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const defaults = settingsDefaults[key];
  if (!row) return defaults;
  const merged = { ...(defaults as object), ...(row.value as object) };
  const parsed = settingsSchemas[key].safeParse(merged);
  return (parsed.success ? parsed.data : defaults) as Settings<K>;
}

export async function getAllSettings() {
  const rows = await prisma.setting.findMany();
  const out = {} as { [K in SettingsKey]: Settings<K> };
  for (const key of Object.keys(settingsSchemas) as SettingsKey[]) {
    const row = rows.find((r) => r.key === key);
    const merged = { ...(settingsDefaults[key] as object), ...((row?.value as object) ?? {}) };
    const parsed = settingsSchemas[key].safeParse(merged);
    (out as Record<string, unknown>)[key] = parsed.success ? parsed.data : settingsDefaults[key];
  }
  return out;
}

export async function saveSettings<K extends SettingsKey>(key: K, value: unknown): Promise<Settings<K>> {
  const parsed = settingsSchemas[key].parse(value) as Settings<K>;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: parsed as object },
    update: { value: parsed as object },
  });
  return parsed;
}

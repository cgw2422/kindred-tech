import type { Prisma } from "@prisma/client";

export type ChecklistItem = { label: string; done: boolean };

export const DEFAULT_CHECKLIST_LABELS = [
  "Confirmed customer's goals",
  "Checked for system updates",
  "Verified backups",
  "Reviewed passwords stored safely (never banking passwords)",
  "Left written notes",
  "Customer satisfied with result",
] as const;

export const MAX_CHECKLIST_ITEMS = 40;
export const MAX_CHECKLIST_LABEL = 160;

export function defaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST_LABELS.map((label) => ({ label, done: false }));
}

/** Safely reads WorkOrder.checklist JSON; falls back to the default list. */
export function parseChecklist(value: Prisma.JsonValue | null | undefined): ChecklistItem[] {
  if (!Array.isArray(value)) return defaultChecklist();
  const out: ChecklistItem[] = [];
  for (const v of value) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { label?: unknown }).label === "string") {
      const label = String((v as { label: string }).label).slice(0, MAX_CHECKLIST_LABEL);
      out.push({ label, done: (v as { done?: unknown }).done === true });
    }
  }
  return out;
}

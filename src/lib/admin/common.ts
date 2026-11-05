import { z } from "zod";
import type { Role } from "@prisma/client";
import { can, type Permission } from "@/lib/auth/permissions";
import { failure, success, zodFieldErrors, type ActionState } from "@/lib/forms";
import { parseDollarsToCents } from "@/lib/money";

/**
 * Shared helpers for admin configuration mutations. Mutation logic lives in
 * src/lib/admin/*.ts so it can be tested directly; server actions are thin
 * wrappers that check the session permission, call these, and revalidate.
 */

export type Actor = { id: string; role: Role };

export class AdminError extends Error {
  fieldErrors?: Record<string, string>;
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AdminError";
    this.fieldErrors = fieldErrors;
  }
}

/** Defense in depth: lib functions re-check the actor's role even though actions already did. */
export function assertCan(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw new AdminError("You do not have permission to do that.");
}

/** Validates input with a zod schema, throwing an AdminError with readable field messages. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors = zodFieldErrors(r.error);
    throw new AdminError(Object.values(fieldErrors)[0] ?? "Please check the form and try again.", fieldErrors);
  }
  return r.data;
}

/** Runs a mutation and converts known errors into an ActionState for useActionState forms. */
export async function toActionState(fn: () => Promise<string | ActionState>): Promise<ActionState> {
  try {
    const r = await fn();
    return typeof r === "string" ? success(r) : r;
  } catch (err) {
    if (err instanceof AdminError) return failure(err.message, err.fieldErrors);
    if (err instanceof z.ZodError) {
      const fieldErrors = zodFieldErrors(err);
      return failure(Object.values(fieldErrors)[0] ?? "Please check the form and try again.", fieldErrors);
    }
    const code = (err as { code?: string }).code;
    if (code === "P2002") return failure("That value is already in use. Please choose a different one.");
    if (code === "P2025") return failure("That record no longer exists. Please refresh the page.");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Form-friendly zod building blocks (accept strings from FormData or typed values)
// ---------------------------------------------------------------------------

/** Treats an absent key like null so optional builders work with zod v4 objects. */
const absentAsNull = <S extends z.ZodType>(schema: S) => z.preprocess((v) => (v === undefined ? null : v), schema);

export const zBool = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1" || v === "yes", z.boolean());

export const zText = (label: string, max = 200) => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long (${max} characters max).`);

export const zOptText = (label: string, max = 2000) =>
  absentAsNull(
    z
    .union([z.string(), z.null()])
    .transform((v) => (v == null ? "" : v.trim()))
    .refine((v) => v.length <= max, `${label} is too long (${max} characters max).`)
    .transform((v) => (v === "" ? null : v)),
  );

export const zOptId = absentAsNull(z.union([z.string(), z.null()]).transform((v) => (v == null || v.trim() === "" ? null : v.trim())));

/** Dollar amount -> integer cents, must be >= 0. */
export const zDollars = (label: string, opts: { min?: number } = {}) =>
  z.union([z.string(), z.number()], { error: `${label} is required.` }).transform((v, ctx) => {
    const cents = typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 100) : null) : parseDollarsToCents(v);
    const min = opts.min ?? 0;
    if (cents === null || cents < min) {
      ctx.addIssue({ code: "custom", message: `${label} must be a dollar amount${min > 0 ? " greater than $0" : " of $0 or more"} (for example 99 or 99.50).` });
      return z.NEVER;
    }
    return cents;
  });

/** Optional dollar amount; blank -> null. */
export const zOptDollars = (label: string) =>
  absentAsNull(z.union([z.string(), z.number(), z.null()]).transform((v, ctx) => {
    if (v == null || (typeof v === "string" && v.trim() === "")) return null;
    const cents = typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 100) : null) : parseDollarsToCents(v);
    if (cents === null || cents < 0) {
      ctx.addIssue({ code: "custom", message: `${label} must be a dollar amount of $0 or more.` });
      return z.NEVER;
    }
    return cents;
  }));

function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return null;
}

export const zInt = (label: string, min: number, max: number) =>
  z.union([z.string(), z.number()], { error: `${label} is required.` }).transform((v, ctx) => {
    const n = toInt(v);
    if (n === null || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} must be a whole number from ${min} to ${max}.` });
      return z.NEVER;
    }
    return n;
  });

export const zOptInt = (label: string, min: number, max: number) =>
  absentAsNull(z.union([z.string(), z.number(), z.null()]).transform((v, ctx) => {
    if (v == null || (typeof v === "string" && v.trim() === "")) return null;
    const n = toInt(v);
    if (n === null || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} must be a whole number from ${min} to ${max}.` });
      return z.NEVER;
    }
    return n;
  }));

export const zDateKey = (label: string) => z.string({ error: `${label} is required.` }).trim().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date.`);

export const zOptDateKey = (label: string) =>
  absentAsNull(
    z
    .union([z.string(), z.null()])
    .transform((v) => (v == null ? "" : v.trim()))
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), `${label} must be a date.`)
    .transform((v) => (v === "" ? null : v)),
  );

/** "HH:MM" (24h, from <input type="time">) -> minutes since midnight; "24:00" allowed. */
export function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

export function minutesToTimeInput(min: number): string {
  if (min >= 1440) return "23:59";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export const zSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug must be at least 2 characters.")
  .max(80, "Slug is too long.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug may only use lowercase letters, numbers and single dashes (for example in-home-support).");

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Splits "a, b c\nd" into trimmed non-empty unique parts. */
export function splitList(value: string | null | undefined, separators: RegExp = /[\s,;]+/): string[] {
  return [...new Set((value ?? "").split(separators).map((s) => s.trim()).filter(Boolean))];
}

export const PAGE_SIZE = 50;

export function pageFromParam(v: string | string[] | undefined): number {
  const n = parseInt(Array.isArray(v) ? v[0] : (v ?? "1"), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

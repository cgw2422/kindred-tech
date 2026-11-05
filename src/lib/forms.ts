import { z } from "zod";

/** Standard return type for server actions used with useActionState. */
export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
};

export const initialActionState: ActionState = { ok: false };

export function fd(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function fdOptional(formData: FormData, key: string): string | null {
  const v = fd(formData, key);
  return v === "" ? null : v;
}

export function fdBool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1" || v === "yes";
}

export function fdInt(formData: FormData, key: string, fallback = 0): number {
  const n = parseInt(fd(formData, key), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v.trim();
  return out;
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function failure(error: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, error, fieldErrors };
}

export function success(message?: string, data?: Record<string, unknown>): ActionState {
  return { ok: true, message, data };
}

// Common validators
export const zPhone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, "Please enter a 10-digit phone number.");
export const zEmail = z.string().trim().toLowerCase().max(200).email("Please enter a valid email address.");
export const zOptionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Please enter a valid email address.");
export const zZip = z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Please enter a 5-digit ZIP code.");

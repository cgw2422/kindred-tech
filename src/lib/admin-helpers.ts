import { redirect } from "next/navigation";

/** Redirect back to a page with a flash message in the query string. */
export function flashRedirect(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

export type Flash = { ok?: string; error?: string };

export function readFlash(sp: Record<string, string | string[] | undefined>): Flash {
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return { ok: pick("ok"), error: pick("error") };
}

/** Parse "YYYY-MM-DD" + "HH:MM" (business local) into minutes. */
export function parseTimeInput(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

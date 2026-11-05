import { prisma } from "./db";

const SENSITIVE_KEYS = /pass|token|secret|card|ssn|bank|signature|note|description|message/i;

/** Strips anything that could be sensitive so audit metadata stays privacy-aware. */
export function sanitizeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      out[k] = typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v;
    }
  }
  return out;
}

export async function audit(params: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: sanitizeMetadata(params.metadata) as object | undefined,
        ip: params.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", (err as Error).message);
  }
}

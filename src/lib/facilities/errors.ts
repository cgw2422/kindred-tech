export class FacilityError extends Error {
  constructor(
    message: string,
    public code: string = "FACILITY_ERROR",
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FacilityError";
  }
}

/** Postgres exclusion-constraint violation from appointment_no_technician_overlap. */
export function isOverlapViolation(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string }; message?: string };
  const msg = e?.message ?? "";
  return msg.includes("appointment_no_technician_overlap") || msg.includes("23P01") || e?.meta?.code === "23P01";
}

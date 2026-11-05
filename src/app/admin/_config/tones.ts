import type { CommunicationStatus, JobStatus } from "@prisma/client";
import type { Tone } from "@/components/ui";

export const commStatusTone: Record<CommunicationStatus, Tone> = { QUEUED: "warn", SENT: "green", FAILED: "danger", SKIPPED: "neutral", LOGGED: "navy" };
export const jobStatusTone: Record<JobStatus, Tone> = { PENDING: "warn", RUNNING: "navy", SUCCEEDED: "green", FAILED: "danger", DEAD: "danger" };

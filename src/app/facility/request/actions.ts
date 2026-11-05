"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { failure, fd, fdOptional, success, type ActionState } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";
import { FacilityError } from "@/lib/facilities/errors";
import { createPortalSessionRequest, requestPortalPayLink } from "@/lib/facilities/portal";
import { runDueJobs } from "@/lib/jobs/queue";
import "@/lib/email/send";

export async function requestSessionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facility:portal");
  if (!(await rateLimit(`facility-request:${user.id}`, 10, 3600))) return failure("You have sent several requests recently. Please try again later or contact us.");
  try {
    await createPortalSessionRequest(user.id, { preferredDates: fd(formData, "preferredDates"), notes: fdOptional(formData, "notes") });
  } catch (err) {
    if (err instanceof FacilityError) return failure(err.message);
    throw err;
  }
  revalidatePath("/facility/request");
  return success("Thank you. We received your request and will be in touch to confirm dates.");
}

export async function emailPayLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facility:portal");
  if (!(await rateLimit(`facility-paylink:${user.id}`, 5, 3600))) return failure("Please wait a little while before requesting another link.");
  try {
    const r = await requestPortalPayLink(user.id, fd(formData, "id"));
    await runDueJobs({ limit: 3 }).catch(() => undefined);
    return success(`A secure payment link was emailed to ${r.sentTo}. Any earlier payment link for this invoice no longer works.`);
  } catch (err) {
    if (err instanceof FacilityError) return failure(err.message);
    throw err;
  }
}

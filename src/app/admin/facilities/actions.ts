"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { failure, fd, fdBool, fdOptional, success, type ActionState } from "@/lib/forms";
import { parseDollarsToCents } from "@/lib/money";
import { localMinuteToUtc } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { FacilityError } from "@/lib/facilities/errors";
import {
  addContact,
  convertInquiryToFacility,
  createAgreement,
  createFacility,
  deleteDraftAgreement,
  inviteContactToPortal,
  removeContact,
  setContactPortalAccess,
  setInquiryStatus,
  setSessionRequestStatus,
  updateAgreement,
  updateContact,
  updateFacility,
  updateFacilityNotes,
  type AgreementInput,
  type ContactInput,
  type FacilityInput,
} from "@/lib/facilities/facilities";
import { createMonthlyContractInvoice } from "@/lib/facilities/billing";
import { prisma } from "@/lib/db";

function handle(err: unknown): ActionState {
  if (err instanceof FacilityError) return failure(err.message, (err.details?.fieldErrors as Record<string, string> | undefined) ?? undefined);
  console.error("[facilities] action failed", (err as Error).message);
  return failure("Something went wrong. Please try again.");
}

/** Dollars field -> cents; empty -> null; invalid -> throws. */
function cents(formData: FormData, key: string, label: string): number | null {
  const raw = fd(formData, key);
  if (!raw) return null;
  const v = parseDollarsToCents(raw);
  if (v == null || v < 0) throw new FacilityError(`${label} must be a dollar amount like 45 or 45.00.`, "VALIDATION");
  return v;
}

function optInt(formData: FormData, key: string): number | null {
  const raw = fd(formData, key);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new FacilityError("Please enter whole numbers.", "VALIDATION");
  return n;
}

async function optDate(formData: FormData, key: string): Promise<Date | null> {
  const raw = fd(formData, key);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new FacilityError("Please enter valid dates.", "VALIDATION");
  const tz = (await getSettings("business")).timeZone;
  return localMinuteToUtc(raw, 0, tz);
}

function facilityInput(formData: FormData): FacilityInput {
  return {
    name: fd(formData, "name"),
    type: (fd(formData, "type") || "INDEPENDENT_LIVING") as FacilityInput["type"],
    line1: fdOptional(formData, "line1"),
    line2: fdOptional(formData, "line2"),
    city: fdOptional(formData, "city"),
    state: fd(formData, "state") || "OH",
    postalCode: fdOptional(formData, "postalCode"),
    county: fdOptional(formData, "county"),
    phone: fdOptional(formData, "phone"),
    email: fdOptional(formData, "email"),
    website: fdOptional(formData, "website"),
    residentCount: optInt(formData, "residentCount"),
    partnershipStatus: (fd(formData, "partnershipStatus") || "LEAD") as FacilityInput["partnershipStatus"],
    partnershipModel: (fdOptional(formData, "partnershipModel") ?? null) as FacilityInput["partnershipModel"],
    residentRateCents: cents(formData, "residentRate", "Resident rate"),
  };
}

function contactInput(formData: FormData): ContactInput {
  return {
    name: fd(formData, "name"),
    title: fdOptional(formData, "title"),
    role: (fd(formData, "role") || "PRIMARY") as ContactInput["role"],
    email: fdOptional(formData, "email"),
    phone: fdOptional(formData, "phone"),
    canViewInvoices: fdBool(formData, "canViewInvoices"),
    canRequestSessions: fdBool(formData, "canRequestSessions"),
  };
}

async function agreementInput(formData: FormData): Promise<AgreementInput> {
  return {
    model: fd(formData, "model") as AgreementInput["model"],
    status: (fd(formData, "status") || "DRAFT") as AgreementInput["status"],
    startDate: await optDate(formData, "startDate"),
    endDate: await optDate(formData, "endDate"),
    renewalDate: await optDate(formData, "renewalDate"),
    signedAt: await optDate(formData, "signedAt"),
    autoRenew: fdBool(formData, "autoRenew"),
    monthlyFeeCents: cents(formData, "monthlyFee", "Monthly fee"),
    sessionRateCents: cents(formData, "sessionRate", "Session rate"),
    residentRateCents: cents(formData, "residentRate", "Resident rate"),
    hoursPerMonth: optInt(formData, "hoursPerMonth"),
    terms: fdOptional(formData, "terms"),
  };
}

const facilityPath = (id: string) => `/admin/facilities/${id}`;

export async function createFacilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  let id: string;
  try {
    const f = await createFacility(facilityInput(formData), user.id);
    id = f.id;
  } catch (err) {
    return handle(err);
  }
  revalidatePath("/admin/facilities");
  redirect(facilityPath(id));
}

export async function updateFacilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    await updateFacility(id, facilityInput(formData), user.id);
  } catch (err) {
    return handle(err);
  }
  revalidatePath(facilityPath(id));
  return success("Community details saved.");
}

export async function updateFacilityNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    await updateFacilityNotes(id, fdOptional(formData, "internalNotes"), user.id);
  } catch (err) {
    return handle(err);
  }
  revalidatePath(facilityPath(id));
  return success("Notes saved.");
}

export async function addContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const facilityId = fd(formData, "facilityId");
  try {
    await addContact(facilityId, contactInput(formData), user.id);
  } catch (err) {
    return handle(err);
  }
  revalidatePath(facilityPath(facilityId));
  return success("Contact added.");
}

export async function updateContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  try {
    const c = await updateContact(fd(formData, "id"), contactInput(formData), user.id);
    revalidatePath(facilityPath(c.facilityId));
  } catch (err) {
    return handle(err);
  }
  return success("Contact saved.");
}

export async function removeContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  try {
    const c = await removeContact(fd(formData, "id"), user.id);
    revalidatePath(facilityPath(c.facilityId));
  } catch (err) {
    return handle(err);
  }
  return success("Contact removed.");
}

export async function setPortalAccessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const enable = fd(formData, "enable") === "1";
  try {
    const c = await setContactPortalAccess(fd(formData, "id"), enable, user.id);
    revalidatePath(facilityPath(c.facilityId));
  } catch (err) {
    return handle(err);
  }
  return success(enable ? "Portal access turned on." : "Portal access turned off.");
}

export async function inviteContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    const r = await inviteContactToPortal(id, user.id);
    const c = await prisma.facilityContact.findUniqueOrThrow({ where: { id } });
    revalidatePath(facilityPath(c.facilityId));
    const base = r.created ? "Portal login created and invitation emailed." : "Invitation emailed to the existing portal login.";
    return success(base, r.devLink ? { details: [`Email delivery is off in development. Sign-in link: ${r.devLink}`] } : undefined);
  } catch (err) {
    return handle(err);
  }
}

export async function saveAgreementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const facilityId = fd(formData, "facilityId");
  const agreementId = fd(formData, "id");
  try {
    const input = await agreementInput(formData);
    if (agreementId) {
      const existing = await prisma.facilityAgreement.findUniqueOrThrow({ where: { id: agreementId } });
      if (existing.facilityId !== facilityId) throw new FacilityError("Agreement does not belong to this community.", "FORBIDDEN");
      await updateAgreement(agreementId, input, user.id);
    } else {
      await createAgreement(facilityId, input, user.id);
    }
  } catch (err) {
    return handle(err);
  }
  revalidatePath(facilityPath(facilityId));
  return success("Agreement saved.");
}

export async function deleteAgreementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  try {
    const id = fd(formData, "id");
    const a = await prisma.facilityAgreement.findUniqueOrThrow({ where: { id } });
    await deleteDraftAgreement(id, user.id);
    revalidatePath(facilityPath(a.facilityId));
  } catch (err) {
    return handle(err);
  }
  return success("Draft agreement deleted.");
}

export async function createContractInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  await requirePermission("billing:manage");
  try {
    const r = await createMonthlyContractInvoice(fd(formData, "id"), fd(formData, "month"), user.id);
    revalidatePath(facilityPath(r.invoice.facilityId!));
    return success(r.created ? `Draft invoice ${r.invoice.number} created.` : `Invoice ${r.invoice.number} already exists for that month.`);
  } catch (err) {
    return handle(err);
  }
}

export async function convertInquiryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  let facilityId: string;
  try {
    const r = await convertInquiryToFacility(fd(formData, "id"), user.id);
    facilityId = r.facility.id;
  } catch (err) {
    return handle(err);
  }
  revalidatePath("/admin/facilities");
  redirect(facilityPath(facilityId));
}

export async function setInquiryStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  try {
    await setInquiryStatus(fd(formData, "id"), fd(formData, "status"), user.id);
  } catch (err) {
    return handle(err);
  }
  revalidatePath("/admin/facilities");
  return success("Updated.");
}

export async function setSessionRequestStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  try {
    const r = await setSessionRequestStatus(fd(formData, "id"), fd(formData, "status"), user.id);
    revalidatePath(facilityPath(r.facilityId));
  } catch (err) {
    return handle(err);
  }
  return success("Updated.");
}

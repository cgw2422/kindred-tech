/**
 * Senior living facility CRM: facilities, contacts, agreements, inquiries and
 * session requests. Staff-only operations; callers must check
 * facilities:view / facilities:manage before calling.
 */
import { z } from "zod";
import type { FacilityContactRole, PartnershipModel, PartnershipStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../codes";
import { audit } from "../audit";
import { queueTemplatedEmail } from "../email/send";
import { deliveryDecision } from "../email/provider";
import { FacilityError } from "./errors";

export const FACILITY_TYPES = [
  "INDEPENDENT_LIVING",
  "ASSISTED_LIVING",
  "CONTINUING_CARE",
  "SENIOR_APARTMENTS",
  "MEMORY_CARE",
  "NURSING",
  "SENIOR_CENTER",
  "OTHER",
] as const;
export const PARTNERSHIP_STATUSES = ["LEAD", "CONTACTED", "PROPOSAL_SENT", "ACTIVE", "PAUSED", "ENDED"] as const;
export const PARTNERSHIP_MODELS = ["RESIDENT_REFERRAL", "RESIDENT_PAID_DAY", "FACILITY_SPONSORED_DAY", "RECURRING_CONTRACT"] as const;
export const CONTACT_ROLES = ["PRIMARY", "ACTIVITIES_DIRECTOR", "EXECUTIVE_DIRECTOR", "BILLING", "OTHER"] as const;
export const AGREEMENT_STATUSES = ["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"] as const;
export const SESSION_REQUEST_STATUSES = ["OPEN", "SCHEDULED", "DECLINED", "CLOSED"] as const;
export const INQUIRY_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"] as const;

export const CONTACT_ROLE_LABELS: Record<FacilityContactRole, string> = {
  PRIMARY: "Primary",
  ACTIVITIES_DIRECTOR: "Activities Director",
  EXECUTIVE_DIRECTOR: "Executive Director",
  BILLING: "Billing",
  OTHER: "Other",
};
export const PARTNERSHIP_MODEL_LABELS: Record<PartnershipModel, string> = {
  RESIDENT_REFERRAL: "Resident referral",
  RESIDENT_PAID_DAY: "Resident-paid Tech Help Day",
  FACILITY_SPONSORED_DAY: "Facility-sponsored Tech Help Day",
  RECURRING_CONTRACT: "Recurring contract",
};
export const PARTNERSHIP_STATUS_LABELS: Record<PartnershipStatus, string> = {
  LEAD: "Lead",
  CONTACTED: "Contacted",
  PROPOSAL_SENT: "Proposal sent",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ENDED: "Ended",
};

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optCents = z.number().int().min(0).max(100_000_00).nullish().transform((v) => (v == null ? null : v));

export const facilityInputSchema = z.object({
  name: z.string().trim().min(2, "Please enter the community name.").max(200),
  type: z.enum(FACILITY_TYPES).default("INDEPENDENT_LIVING"),
  line1: optText(200),
  line2: optText(200),
  city: optText(100),
  state: z.string().trim().max(2).default("OH").transform((v) => (v || "OH").toUpperCase()),
  postalCode: optText(10),
  county: optText(100),
  phone: optText(30),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .nullish()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email address.")
    .transform((v) => (v ? v : null)),
  website: optText(300),
  residentCount: z.number().int().min(0).max(100_000).nullish().transform((v) => (v == null ? null : v)),
  partnershipStatus: z.enum(PARTNERSHIP_STATUSES).default("LEAD"),
  partnershipModel: z.enum(PARTNERSHIP_MODELS).nullish().transform((v) => v ?? null),
  residentRateCents: optCents,
});
export type FacilityInput = z.input<typeof facilityInputSchema>;

export const contactInputSchema = z.object({
  name: z.string().trim().min(2, "Please enter the contact's name.").max(200),
  title: optText(200),
  role: z.enum(CONTACT_ROLES).default("PRIMARY"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .nullish()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email address.")
    .transform((v) => (v ? v : null)),
  phone: optText(30),
  canViewInvoices: z.boolean().default(true),
  canRequestSessions: z.boolean().default(true),
});
export type ContactInput = z.input<typeof contactInputSchema>;

const optDate = z.date().nullish().transform((v) => v ?? null);
export const agreementInputSchema = z
  .object({
    model: z.enum(PARTNERSHIP_MODELS),
    status: z.enum(AGREEMENT_STATUSES).default("DRAFT"),
    startDate: optDate,
    endDate: optDate,
    renewalDate: optDate,
    autoRenew: z.boolean().default(false),
    monthlyFeeCents: optCents,
    sessionRateCents: optCents,
    residentRateCents: optCents,
    hoursPerMonth: z.number().int().min(0).max(744).nullish().transform((v) => (v == null ? null : v)),
    terms: optText(20_000),
    signedAt: optDate,
  })
  .refine((a) => !a.startDate || !a.endDate || a.endDate >= a.startDate, { message: "The end date must be after the start date.", path: ["endDate"] });
export type AgreementInput = z.input<typeof agreementInputSchema>;

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) {
      const k = i.path.join(".");
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    throw new FacilityError(r.error.issues[0]?.message ?? "Please check the form.", "VALIDATION", { fieldErrors });
  }
  return r.data;
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export async function listFacilities(filters: { status?: string | null; model?: string | null; q?: string | null } = {}) {
  const where: Prisma.FacilityWhereInput = {};
  if (filters.status && (PARTNERSHIP_STATUSES as readonly string[]).includes(filters.status)) where.partnershipStatus = filters.status as PartnershipStatus;
  if (filters.model && (PARTNERSHIP_MODELS as readonly string[]).includes(filters.model)) where.partnershipModel = filters.model as PartnershipModel;
  if (filters.q) where.OR = [{ name: { contains: filters.q, mode: "insensitive" } }, { city: { contains: filters.q, mode: "insensitive" } }];
  const now = new Date();
  return prisma.facility.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      contacts: { where: { role: { in: ["PRIMARY", "ACTIVITIES_DIRECTOR"] } }, orderBy: { createdAt: "asc" }, take: 1 },
      techHelpDays: { where: { startsAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } }, orderBy: { startsAt: "asc" }, take: 1, select: { id: true, startsAt: true } },
      _count: { select: { residents: true, techHelpDays: true } },
    },
  });
}

export async function createFacility(input: FacilityInput, actorUserId?: string | null) {
  const data = parseOrThrow(facilityInputSchema, input);
  const facility = await prisma.facility.create({ data });
  await audit({ actorUserId, action: "facility.created", entityType: "Facility", entityId: facility.id, metadata: { name: facility.name } });
  return facility;
}

export async function updateFacility(id: string, input: FacilityInput, actorUserId?: string | null) {
  const data = parseOrThrow(facilityInputSchema, input);
  const facility = await prisma.facility.update({ where: { id }, data });
  await audit({ actorUserId, action: "facility.updated", entityType: "Facility", entityId: id, metadata: { partnershipStatus: data.partnershipStatus, partnershipModel: data.partnershipModel } });
  return facility;
}

export async function updateFacilityNotes(id: string, internalNotes: string | null, actorUserId?: string | null) {
  await prisma.facility.update({ where: { id }, data: { internalNotes: internalNotes?.trim().slice(0, 20_000) || null } });
  await audit({ actorUserId, action: "facility.notes_updated", entityType: "Facility", entityId: id });
}

// ---------------------------------------------------------------------------
// Contacts & portal access
// ---------------------------------------------------------------------------

export async function addContact(facilityId: string, input: ContactInput, actorUserId?: string | null) {
  const data = parseOrThrow(contactInputSchema, input);
  const contact = await prisma.facilityContact.create({ data: { ...data, facilityId } });
  await audit({ actorUserId, action: "facility.contact_added", entityType: "FacilityContact", entityId: contact.id, metadata: { facilityId } });
  return contact;
}

export async function updateContact(contactId: string, input: ContactInput, actorUserId?: string | null) {
  const data = parseOrThrow(contactInputSchema, input);
  const existing = await prisma.facilityContact.findUniqueOrThrow({ where: { id: contactId } });
  // Changing the email of a linked contact unlinks the old login.
  const emailChanged = (existing.email ?? "") !== (data.email ?? "");
  const contact = await prisma.facilityContact.update({
    where: { id: contactId },
    data: { ...data, ...(emailChanged && existing.userId ? { userId: null, portalAccess: false } : {}) },
  });
  await audit({ actorUserId, action: "facility.contact_updated", entityType: "FacilityContact", entityId: contactId, metadata: { facilityId: existing.facilityId, emailChanged } });
  return contact;
}

export async function removeContact(contactId: string, actorUserId?: string | null) {
  const c = await prisma.facilityContact.delete({ where: { id: contactId } });
  await audit({ actorUserId, action: "facility.contact_removed", entityType: "FacilityContact", entityId: contactId, metadata: { facilityId: c.facilityId } });
  return c;
}

export async function setContactPortalAccess(contactId: string, portalAccess: boolean, actorUserId?: string | null) {
  const c = await prisma.facilityContact.update({ where: { id: contactId }, data: { portalAccess } });
  if (!portalAccess && c.userId) {
    // End any open portal sessions if the user no longer has access anywhere.
    const stillHasAccess = await prisma.facilityContact.count({ where: { userId: c.userId, portalAccess: true } });
    if (stillHasAccess === 0) await prisma.session.deleteMany({ where: { userId: c.userId } });
  }
  await audit({ actorUserId, action: portalAccess ? "facility.portal_enabled" : "facility.portal_disabled", entityType: "FacilityContact", entityId: contactId, metadata: { facilityId: c.facilityId } });
  return c;
}

/**
 * Creates (or links) a FACILITY_CONTACT login for the contact's email, turns
 * on portal access, and emails a one-time sign-in link. The contact can later
 * sign in with the email-link option at /login.
 */
export async function inviteContactToPortal(contactId: string, actorUserId?: string | null) {
  const contact = await prisma.facilityContact.findUniqueOrThrow({ where: { id: contactId }, include: { facility: true } });
  const email = contact.email?.trim().toLowerCase();
  if (!email) throw new FacilityError("Add an email address for this contact before inviting them to the portal.", "NO_EMAIL");

  let user = await prisma.user.findUnique({ where: { email } });
  let created = false;
  if (user && user.role !== "FACILITY_CONTACT") {
    throw new FacilityError("That email address already belongs to a different type of account. Use a different email for portal access.", "EMAIL_IN_USE");
  }
  if (!user) {
    user = await prisma.user.create({ data: { email, name: contact.name, phone: contact.phone, role: "FACILITY_CONTACT" } });
    created = true;
  } else if (!user.isActive) {
    user = await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  }
  await prisma.facilityContact.update({ where: { id: contactId }, data: { userId: user.id, portalAccess: true } });

  const token = randomToken(32);
  await prisma.authToken.create({
    data: { tokenHash: sha256(token), type: "ACCOUNT_INVITE", userId: user.id, expiresAt: new Date(Date.now() + 7 * 86400_000) },
  });
  const url = `${env.appUrl}/auth/verify?token=${token}`;
  await queueTemplatedEmail({
    templateKey: "password_reset",
    to: email,
    facilityId: contact.facilityId,
    vars: {
      customerName: contact.name.split(" ")[0],
      actionText: `access the Kindred partner portal for ${contact.facility.name}`,
      buttonLabel: "Open the partner portal",
      actionUrl: url,
      expiresIn: "7 days",
    },
    idempotencyKey: `facility-invite:${sha256(token)}`,
    relatedType: "FacilityContact",
    relatedId: contactId,
    createdById: actorUserId ?? null,
  });
  await audit({ actorUserId, action: "facility.portal_invited", entityType: "FacilityContact", entityId: contactId, metadata: { facilityId: contact.facilityId, userCreated: created } });
  const devLink = !env.isProduction && !deliveryDecision(email).allowed ? url : undefined;
  return { userId: user.id, created, devLink };
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

export async function createAgreement(facilityId: string, input: AgreementInput, actorUserId?: string | null) {
  const data = parseOrThrow(agreementInputSchema, input);
  const a = await prisma.facilityAgreement.create({ data: { ...data, facilityId } });
  await audit({ actorUserId, action: "facility.agreement_created", entityType: "FacilityAgreement", entityId: a.id, metadata: { facilityId, status: a.status, model: a.model } });
  return a;
}

export async function updateAgreement(agreementId: string, input: AgreementInput, actorUserId?: string | null) {
  const data = parseOrThrow(agreementInputSchema, input);
  const a = await prisma.facilityAgreement.update({ where: { id: agreementId }, data });
  await audit({ actorUserId, action: "facility.agreement_updated", entityType: "FacilityAgreement", entityId: a.id, metadata: { facilityId: a.facilityId, status: a.status, model: a.model } });
  return a;
}

export async function deleteDraftAgreement(agreementId: string, actorUserId?: string | null) {
  const a = await prisma.facilityAgreement.findUniqueOrThrow({ where: { id: agreementId } });
  if (a.status !== "DRAFT") throw new FacilityError("Only draft agreements can be deleted. Mark it terminated or expired instead.", "NOT_DRAFT");
  await prisma.facilityAgreement.delete({ where: { id: agreementId } });
  await audit({ actorUserId, action: "facility.agreement_deleted", entityType: "FacilityAgreement", entityId: agreementId, metadata: { facilityId: a.facilityId } });
}

/** The agreement currently in force (ACTIVE, most recently started). */
export async function activeAgreementFor(facilityId: string, client: Pick<typeof prisma, "facilityAgreement"> = prisma) {
  return client.facilityAgreement.findFirst({ where: { facilityId, status: "ACTIVE" }, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }] });
}

// ---------------------------------------------------------------------------
// Inquiries & session requests
// ---------------------------------------------------------------------------

export async function listInquiries(opts: { includeClosed?: boolean } = {}) {
  return prisma.facilityInquiry.findMany({
    where: opts.includeClosed ? {} : { status: { notIn: ["CONVERTED", "CLOSED"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function setInquiryStatus(inquiryId: string, status: string, actorUserId?: string | null) {
  if (!(INQUIRY_STATUSES as readonly string[]).includes(status)) throw new FacilityError("Unknown status.", "VALIDATION");
  await prisma.facilityInquiry.update({ where: { id: inquiryId }, data: { status } });
  await audit({ actorUserId, action: "facility.inquiry_status", entityType: "FacilityInquiry", entityId: inquiryId, metadata: { status } });
}

/** Converts a partnership inquiry into a Facility (status CONTACTED) with a primary contact. Idempotent. */
export async function convertInquiryToFacility(inquiryId: string, actorUserId?: string | null) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"inquiry:" + inquiryId}))`;
    const inq = await tx.facilityInquiry.findUniqueOrThrow({ where: { id: inquiryId } });
    if (inq.facilityId) {
      const existing = await tx.facility.findUnique({ where: { id: inq.facilityId } });
      if (existing) return { facility: existing, created: false };
    }
    const noteParts = [
      `Converted from website inquiry received ${inq.createdAt.toISOString().slice(0, 10)}.`,
      inq.interest ? `Interest: ${inq.interest}` : null,
      inq.message ? `Message: ${inq.message}` : null,
    ].filter(Boolean);
    const facility = await tx.facility.create({
      data: {
        name: inq.facilityName.trim(),
        city: inq.city?.trim() || null,
        residentCount: inq.residentCount ?? null,
        partnershipStatus: "CONTACTED",
        internalNotes: noteParts.join("\n"),
        contacts: {
          create: {
            name: inq.contactName.trim(),
            title: inq.contactTitle?.trim() || null,
            role: "PRIMARY",
            email: inq.email.trim().toLowerCase(),
            phone: inq.phone?.trim() || null,
          },
        },
      },
    });
    await tx.facilityInquiry.update({ where: { id: inquiryId }, data: { status: "CONVERTED", facilityId: facility.id } });
    return { facility, created: true };
  });
  if (result.created) {
    await audit({ actorUserId, action: "facility.inquiry_converted", entityType: "Facility", entityId: result.facility.id, metadata: { inquiryId } });
  }
  return result;
}

export async function setSessionRequestStatus(requestId: string, status: string, actorUserId?: string | null) {
  if (!(SESSION_REQUEST_STATUSES as readonly string[]).includes(status)) throw new FacilityError("Unknown status.", "VALIDATION");
  const r = await prisma.facilitySessionRequest.update({ where: { id: requestId }, data: { status } });
  await audit({ actorUserId, action: "facility.session_request_status", entityType: "FacilitySessionRequest", entityId: requestId, metadata: { facilityId: r.facilityId, status } });
  return r;
}

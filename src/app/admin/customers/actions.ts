"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ConsentMethod, ConsentType, ContactPreference, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flashRedirect } from "@/lib/admin-helpers";
import { fd, fdBool } from "@/lib/forms";
import { lookupServiceArea } from "@/lib/booking/service";

const PREFS: ContactPreference[] = ["EMAIL", "PHONE", "TEXT", "MAIL"];
const STATUSES: CustomerStatus[] = ["LEAD", "ACTIVE", "INACTIVE"];

const customerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  preferredName: z.string().trim().max(60),
  email: z.string().trim().toLowerCase().max(200).refine((v) => v === "" || z.string().email().safeParse(v).success, "Invalid email."),
  phone: z.string().trim().max(30),
  bestTimeToContact: z.string().trim().max(120),
  leadSource: z.string().trim().max(100),
});

function path(id: string) {
  return `/admin/customers/${id}`;
}

export async function createCustomerAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const parsed = customerSchema.safeParse(Object.fromEntries(["firstName", "lastName", "preferredName", "email", "phone", "bestTimeToContact", "leadSource"].map((k) => [k, fd(formData, k)])));
  if (!parsed.success) flashRedirect("/admin/customers/new", "error", parsed.error.issues[0].message);
  const v = parsed.data!;
  const pref = fd(formData, "contactPreference") as ContactPreference;
  const customer = await prisma.customer.create({
    data: {
      firstName: v.firstName,
      lastName: v.lastName,
      preferredName: v.preferredName || null,
      email: v.email || null,
      phone: v.phone || null,
      bestTimeToContact: v.bestTimeToContact || null,
      leadSource: v.leadSource || null,
      contactPreference: PREFS.includes(pref) ? pref : "PHONE",
      status: "ACTIVE",
    },
  });
  if (fd(formData, "line1")) {
    const area = await lookupServiceArea(fd(formData, "postalCode"));
    await prisma.address.create({
      data: { customerId: customer.id, line1: fd(formData, "line1"), line2: fd(formData, "line2") || null, city: fd(formData, "city"), state: fd(formData, "state") || "OH", postalCode: fd(formData, "postalCode"), county: area?.county ?? null, isPrimary: true },
    });
  }
  await audit({ actorUserId: user.id, action: "customer.created", entityType: "Customer", entityId: customer.id });
  flashRedirect(path(customer.id), "ok", "Customer created.");
}

export async function updateCustomerAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "id");
  const parsed = customerSchema.safeParse(Object.fromEntries(["firstName", "lastName", "preferredName", "email", "phone", "bestTimeToContact", "leadSource"].map((k) => [k, fd(formData, k)])));
  if (!parsed.success) flashRedirect(path(id), "error", parsed.error.issues[0].message);
  const v = parsed.data!;
  const pref = fd(formData, "contactPreference") as ContactPreference;
  const status = fd(formData, "status") as CustomerStatus;
  await prisma.customer.update({
    where: { id },
    data: {
      firstName: v.firstName,
      lastName: v.lastName,
      preferredName: v.preferredName || null,
      email: v.email || null,
      phone: v.phone || null,
      bestTimeToContact: v.bestTimeToContact || null,
      leadSource: v.leadSource || null,
      contactPreference: PREFS.includes(pref) ? pref : undefined,
      status: STATUSES.includes(status) ? status : undefined,
    },
  });
  await audit({ actorUserId: user.id, action: "customer.updated", entityType: "Customer", entityId: id });
  revalidatePath(path(id));
  flashRedirect(path(id), "ok", "Customer saved.");
}

export async function updateNotesAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "id");
  await prisma.customer.update({ where: { id }, data: { internalNotes: fd(formData, "internalNotes").slice(0, 10000) || null } });
  await audit({ actorUserId: user.id, action: "customer.notes_updated", entityType: "Customer", entityId: id });
  flashRedirect(path(id), "ok", "Notes saved.");
}

export async function setMarketingConsentAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "id");
  const granted = fd(formData, "granted") === "1";
  const method = (fd(formData, "method") || "VERBAL") as ConsentMethod;
  await prisma.$transaction([
    prisma.customer.update({ where: { id }, data: { marketingOptIn: granted, marketingOptInAt: granted ? new Date() : null } }),
    prisma.consentRecord.create({ data: { customerId: id, type: "MARKETING_EMAIL", granted, method, recordedById: user.id, notes: fd(formData, "notes") || null } }),
  ]);
  await audit({ actorUserId: user.id, action: "customer.marketing_consent", entityType: "Customer", entityId: id, metadata: { granted } });
  flashRedirect(path(id), "ok", granted ? "Marketing consent recorded." : "Marketing consent withdrawn.");
}

export async function addConsentAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "id");
  const type = fd(formData, "type") as ConsentType;
  const method = fd(formData, "method") as ConsentMethod;
  const types: ConsentType[] = ["SERVICE_AUTHORIZATION", "MARKETING_EMAIL", "SUBSCRIPTION_CHANGES", "REMOTE_ACCESS", "FAMILY_INFORMATION_SHARING", "TERMS_ACCEPTED", "OTHER"];
  const methods: ConsentMethod[] = ["WEB_FORM", "VERBAL", "SIGNATURE", "EMAIL", "PAPER"];
  if (!types.includes(type) || !methods.includes(method)) flashRedirect(path(id), "error", "Invalid consent.");
  await prisma.consentRecord.create({
    data: { customerId: id, type, method, granted: fd(formData, "granted") !== "0", grantedByName: fd(formData, "grantedByName") || null, notes: fd(formData, "notes") || null, recordedById: user.id },
  });
  await audit({ actorUserId: user.id, action: "customer.consent_recorded", entityType: "Customer", entityId: id, metadata: { type } });
  flashRedirect(path(id), "ok", "Consent recorded.");
}

export async function saveAddressAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "customerId");
  const addressId = fd(formData, "addressId");
  const zip = fd(formData, "postalCode");
  if (!fd(formData, "line1") || !fd(formData, "city") || !/^\d{5}(-\d{4})?$/.test(zip)) flashRedirect(path(id), "error", "Street, city, and a 5-digit ZIP are required.");
  const area = await lookupServiceArea(zip);
  const data = {
    label: fd(formData, "label") || null,
    line1: fd(formData, "line1"),
    line2: fd(formData, "line2") || null,
    city: fd(formData, "city"),
    state: (fd(formData, "state") || "OH").toUpperCase(),
    postalCode: zip,
    county: area?.county ?? null,
    accessNotes: fd(formData, "accessNotes") || null,
  };
  const makePrimary = fdBool(formData, "isPrimary");
  await prisma.$transaction(async (tx) => {
    if (makePrimary) await tx.address.updateMany({ where: { customerId: id }, data: { isPrimary: false } });
    if (addressId) {
      await tx.address.update({ where: { id: addressId, customerId: id }, data: { ...data, ...(makePrimary ? { isPrimary: true } : {}), lat: null, lng: null, geocodedBy: null } });
    } else {
      const count = await tx.address.count({ where: { customerId: id } });
      await tx.address.create({ data: { ...data, customerId: id, isPrimary: makePrimary || count === 0 } });
    }
  });
  await audit({ actorUserId: user.id, action: addressId ? "customer.address_updated" : "customer.address_added", entityType: "Customer", entityId: id });
  flashRedirect(path(id), "ok", "Address saved.");
}

export async function deleteAddressAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "customerId");
  const addressId = fd(formData, "addressId");
  const used = await prisma.appointment.count({ where: { addressId } });
  if (used > 0) flashRedirect(path(id), "error", "This address is used by appointments and cannot be removed.");
  await prisma.address.delete({ where: { id: addressId, customerId: id } });
  await audit({ actorUserId: user.id, action: "customer.address_removed", entityType: "Customer", entityId: id });
  flashRedirect(path(id), "ok", "Address removed.");
}

export async function saveFamilyContactAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "customerId");
  const contactId = fd(formData, "contactId");
  if (!fd(formData, "name")) flashRedirect(path(id), "error", "Contact name is required.");
  const email = fd(formData, "email").toLowerCase();
  if (email && !z.string().email().safeParse(email).success) flashRedirect(path(id), "error", "Invalid contact email.");
  const data = {
    name: fd(formData, "name"),
    relationship: fd(formData, "relationship") || null,
    email: email || null,
    phone: fd(formData, "phone") || null,
    canSchedule: fdBool(formData, "canSchedule"),
    canPay: fdBool(formData, "canPay"),
    canReceiveUpdates: fdBool(formData, "canReceiveUpdates"),
    canViewServiceDetails: fdBool(formData, "canViewServiceDetails"),
    isBillingContact: fdBool(formData, "isBillingContact") && fdBool(formData, "canPay"),
    notes: fd(formData, "notes") || null,
  };
  if (data.canViewServiceDetails && !fd(formData, "authorizedBy")) {
    flashRedirect(path(id), "error", "Enter the name of the customer who authorized sharing service details.");
  }
  if (contactId) await prisma.familyContact.update({ where: { id: contactId, customerId: id }, data });
  else await prisma.familyContact.create({ data: { ...data, customerId: id } });
  // Record that the customer authorized sharing (the staff member confirms this before saving).
  if (data.canViewServiceDetails) {
    await prisma.consentRecord.create({ data: { customerId: id, type: "FAMILY_INFORMATION_SHARING", granted: true, method: "VERBAL", grantedByName: fd(formData, "authorizedBy") || null, notes: `Service details shared with ${data.name}`, recordedById: user.id } });
  }
  await audit({ actorUserId: user.id, action: "customer.family_contact_saved", entityType: "Customer", entityId: id, metadata: { canPay: data.canPay, canViewServiceDetails: data.canViewServiceDetails } });
  flashRedirect(path(id), "ok", "Authorized contact saved.");
}

export async function deleteFamilyContactAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "customerId");
  await prisma.familyContact.delete({ where: { id: fd(formData, "contactId"), customerId: id } });
  await audit({ actorUserId: user.id, action: "customer.family_contact_removed", entityType: "Customer", entityId: id });
  flashRedirect(path(id), "ok", "Authorized contact removed.");
}

export async function saveDeviceAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "customerId");
  if (!fd(formData, "type")) flashRedirect(path(id), "error", "Device type is required.");
  const data = { type: fd(formData, "type"), make: fd(formData, "make") || null, model: fd(formData, "model") || null, os: fd(formData, "os") || null, nickname: fd(formData, "nickname") || null, notes: fd(formData, "notes") || null };
  const deviceId = fd(formData, "deviceId");
  if (deviceId) await prisma.device.update({ where: { id: deviceId, customerId: id }, data });
  else await prisma.device.create({ data: { ...data, customerId: id } });
  await audit({ actorUserId: user.id, action: "customer.device_saved", entityType: "Customer", entityId: id });
  flashRedirect(path(id), "ok", "Device saved.");
}

export async function deleteDeviceAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "customerId");
  await prisma.device.delete({ where: { id: fd(formData, "deviceId"), customerId: id } });
  await audit({ actorUserId: user.id, action: "customer.device_removed", entityType: "Customer", entityId: id });
  flashRedirect(path(id), "ok", "Device removed.");
}

export async function logCommunicationAction(formData: FormData) {
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "customerId");
  const channel = fd(formData, "channel") === "NOTE" ? "NOTE" : fd(formData, "channel") === "IN_PERSON" ? "IN_PERSON" : "PHONE";
  if (!fd(formData, "summary")) flashRedirect(path(id), "error", "Please add a short summary.");
  await prisma.communication.create({
    data: { channel, direction: fd(formData, "direction") === "INBOUND" ? "INBOUND" : "OUTBOUND", customerId: id, subject: fd(formData, "subject") || null, bodyPreview: fd(formData, "summary").slice(0, 2000), status: "LOGGED", createdById: user.id },
  });
  flashRedirect(path(id), "ok", "Communication logged.");
}

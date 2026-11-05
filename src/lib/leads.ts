import type { Prisma } from "@prisma/client";

/**
 * Lead classification shared by the admin dashboard and leads inbox.
 * Community leads = facility partnership inquiries plus contact-form messages
 * whose topic is "Senior living community". Everything else is residential/general.
 */
export const COMMUNITY_CONTACT_TOPIC = "Senior living community";

export const communityMessageWhere: Prisma.ContactMessageWhereInput = { topic: COMMUNITY_CONTACT_TOPIC };
export const residentialMessageWhere: Prisma.ContactMessageWhereInput = { OR: [{ topic: null }, { topic: { not: COMMUNITY_CONTACT_TOPIC } }] };

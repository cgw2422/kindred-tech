import type { FacilityContact } from "@prisma/client";
import { CONTACT_ROLES, CONTACT_ROLE_LABELS } from "@/lib/facilities/facilities";
import { FCheckbox, FInput, FSelect } from "./fields";

export function ContactFields({ contact, idPrefix }: { contact?: FacilityContact | null; idPrefix: string }) {
  const c = contact;
  const n = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      <div className="grid gap-x-6 md:grid-cols-2">
        <FInput id={n("name")} label="Name" name="name" required defaultValue={c?.name} maxLength={200} />
        <FInput id={n("title")} label="Job title" name="title" defaultValue={c?.title ?? ""} maxLength={200} />
        <FSelect id={n("role")} label="Role" name="role" required defaultValue={c?.role ?? "PRIMARY"} options={CONTACT_ROLES.map((r) => ({ value: r, label: CONTACT_ROLE_LABELS[r] }))} />
        <FInput id={n("email")} label="Email" name="email" type="email" defaultValue={c?.email ?? ""} hint="Required for portal access and notices." />
        <FInput id={n("phone")} label="Phone" name="phone" type="tel" defaultValue={c?.phone ?? ""} />
      </div>
      <div className="flex flex-wrap gap-x-8">
        <FCheckbox id={n("canViewInvoices")} label="Can view invoices in the portal" name="canViewInvoices" defaultChecked={c?.canViewInvoices ?? true} />
        <FCheckbox id={n("canRequestSessions")} label="Can request additional sessions" name="canRequestSessions" defaultChecked={c?.canRequestSessions ?? true} />
      </div>
    </>
  );
}

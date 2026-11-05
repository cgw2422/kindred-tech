import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Card, Notice } from "@/components/ui";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "My Details" };

export default async function ProfilePage() {
  const user = await requirePermission("customer:portal", "/portal/profile");
  const customer = user.customerId ? await prisma.customer.findUnique({ where: { id: user.customerId }, include: { addresses: true, familyContacts: true } }) : null;
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-3xl">My details</h1>
      {!customer ? (
        <Notice tone="navy">Your sign-in is for an authorized family contact. To update the details of the person you help, please contact us.</Notice>
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="mb-3 text-xl">Contact information & preferences</h2>
            <ProfileForm
              customer={{
                firstName: customer.firstName,
                lastName: customer.lastName,
                preferredName: customer.preferredName ?? "",
                phone: customer.phone ?? "",
                bestTimeToContact: customer.bestTimeToContact ?? "",
                contactPreference: customer.contactPreference,
                marketingOptIn: customer.marketingOptIn,
              }}
            />
            <p className="mt-3 text-sm">Your email address ({user.email}) is how you sign in. To change it, please contact us.</p>
          </Card>
          <Card className="mb-6">
            <h2 className="mb-3 text-xl">Addresses</h2>
            <ul className="space-y-1">
              {customer.addresses.map((a) => (
                <li key={a.id}>
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.postalCode} {a.isPrimary && "(primary)"}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm">To add or change an address, enter it when you schedule or contact us.</p>
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">People you have authorized</h2>
            {customer.familyContacts.length === 0 ? (
              <p>No one yet. Family members can be added when they book for you, or by contacting us.</p>
            ) : (
              <ul className="space-y-2">
                {customer.familyContacts.map((f) => (
                  <li key={f.id}>
                    <span className="font-semibold">{f.name}</span> {f.relationship && `(${f.relationship})`}: may{" "}
                    {[f.canSchedule && "schedule", f.canPay && "pay", f.canReceiveUpdates && "receive updates", f.canViewServiceDetails && "see visit details"].filter(Boolean).join(", ") || "nothing yet"}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm">
              To change what someone can see, <Link href="/portal/support">send us a request</Link>. We confirm permission changes with you directly.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

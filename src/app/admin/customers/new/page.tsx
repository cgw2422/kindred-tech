import { requirePermission } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { createCustomerAction } from "../actions";

export const metadata = { title: "Add Customer" };
const f = "mb-3 block w-full rounded-md border-2 border-line px-3 py-2";
const l = "mb-1 block font-semibold text-navy";

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("customers:manage", "/admin/customers/new");
  const flash = readFlash(await searchParams);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add customer" />
      <Flash flash={flash} />
      <form action={createCustomerAction}>
        <Card>
          <div className="grid gap-x-4 md:grid-cols-2">
            {[
              ["firstName", "First name", true],
              ["lastName", "Last name", true],
              ["preferredName", "Preferred name", false],
              ["phone", "Phone", false],
              ["email", "Email", false],
              ["bestTimeToContact", "Best time to contact", false],
              ["leadSource", "Lead source", false],
            ].map(([name, label, req]) => (
              <div key={name as string}>
                <label htmlFor={name as string} className={l}>
                  {label as string}
                  {req ? " *" : ""}
                </label>
                <input id={name as string} name={name as string} required={req as boolean} className={f} />
              </div>
            ))}
            <div>
              <label htmlFor="contactPreference" className={l}>
                Contact preference
              </label>
              <select id="contactPreference" name="contactPreference" className={f}>
                <option value="PHONE">Phone</option>
                <option value="EMAIL">Email</option>
                <option value="TEXT">Text</option>
                <option value="MAIL">Mail</option>
              </select>
            </div>
          </div>
          <h2 className="mt-4 mb-2 text-lg">Primary address (optional)</h2>
          <div className="grid gap-x-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="line1" className={l}>Street</label>
              <input id="line1" name="line1" className={f} />
            </div>
            <div>
              <label htmlFor="line2" className={l}>Apt / unit</label>
              <input id="line2" name="line2" className={f} />
            </div>
            <div>
              <label htmlFor="city" className={l}>City</label>
              <input id="city" name="city" className={f} />
            </div>
            <div>
              <label htmlFor="state" className={l}>State</label>
              <input id="state" name="state" defaultValue="OH" maxLength={2} className={f} />
            </div>
            <div>
              <label htmlFor="postalCode" className={l}>ZIP</label>
              <input id="postalCode" name="postalCode" className={f} />
            </div>
          </div>
          <SubmitButton size="lg">Create customer</SubmitButton>
        </Card>
      </form>
    </div>
  );
}

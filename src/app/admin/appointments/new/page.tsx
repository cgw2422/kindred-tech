import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { getSettings } from "@/lib/settings";
import { addDaysToKey, toDateKey } from "@/lib/time";
import { formatCents } from "@/lib/money";
import { manualBookingAction } from "../actions";

export const metadata = { title: "New Appointment" };

const field = "mb-3 block w-full rounded-md border-2 border-line px-3 py-2";
const lbl = "mb-1 block font-semibold text-navy";

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("appointments:manage", "/admin/appointments/new");
  const sp = await searchParams;
  const flash = readFlash(sp);
  const biz = await getSettings("business");
  const [services, techs, customer] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.technician.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } }),
    sp.customerId ? prisma.customer.findUnique({ where: { id: sp.customerId }, include: { addresses: true } }) : null,
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New appointment" description="Book on behalf of a customer (for example, after a phone call). Double-booking is always prevented." />
      <Flash flash={flash} />
      <form action={manualBookingAction}>
        <Card className="mb-6">
          <h2 className="mb-3 text-xl">Customer</h2>
          {customer ? (
            <>
              <input type="hidden" name="customerId" value={customer.id} />
              <p className="mb-3 font-semibold">
                {customer.firstName} {customer.lastName} {customer.phone && `· ${customer.phone}`}
              </p>
              {customer.addresses.length > 0 && (
                <>
                  <label htmlFor="addressId" className={lbl}>
                    Address
                  </label>
                  <select id="addressId" name="addressId" className={field} defaultValue={customer.addresses.find((a) => a.isPrimary)?.id}>
                    {customer.addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label ? `${a.label}: ` : ""}
                        {a.line1}, {a.city}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          ) : (
            <>
              <p className="mb-3 text-sm">To book for an existing customer, open their record and choose &quot;New appointment&quot;. Otherwise enter new customer details:</p>
              <div className="grid gap-x-4 md:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className={lbl}>First name</label>
                  <input id="firstName" name="firstName" required className={field} />
                </div>
                <div>
                  <label htmlFor="lastName" className={lbl}>Last name</label>
                  <input id="lastName" name="lastName" required className={field} />
                </div>
                <div>
                  <label htmlFor="phone" className={lbl}>Phone</label>
                  <input id="phone" name="phone" type="tel" className={field} />
                </div>
                <div>
                  <label htmlFor="email" className={lbl}>Email</label>
                  <input id="email" name="email" type="email" className={field} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="line1" className={lbl}>Street address</label>
                  <input id="line1" name="line1" className={field} />
                </div>
                <div>
                  <label htmlFor="city" className={lbl}>City</label>
                  <input id="city" name="city" className={field} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="state" className={lbl}>State</label>
                    <input id="state" name="state" defaultValue="OH" maxLength={2} className={field} />
                  </div>
                  <div>
                    <label htmlFor="postalCode" className={lbl}>ZIP</label>
                    <input id="postalCode" name="postalCode" className={field} />
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
        <Card className="mb-6">
          <h2 className="mb-3 text-xl">Appointment</h2>
          <label htmlFor="serviceId" className={lbl}>Service</label>
          <select id="serviceId" name="serviceId" required className={field}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.pricingType === "CUSTOM_QUOTE" ? "custom" : formatCents(s.basePriceCents)}, {s.durationMinutes} min)
              </option>
            ))}
          </select>
          <div className="grid gap-x-4 md:grid-cols-3">
            <div>
              <label htmlFor="date" className={lbl}>Date</label>
              <input id="date" name="date" type="date" required defaultValue={addDaysToKey(toDateKey(new Date(), biz.timeZone), 1)} className={field} />
            </div>
            <div>
              <label htmlFor="time" className={lbl}>Start time (Eastern)</label>
              <input id="time" name="time" type="time" step={900} required defaultValue="10:00" className={field} />
            </div>
            <div>
              <label htmlFor="extensionBlocks" className={lbl}>Extra time blocks</label>
              <input id="extensionBlocks" name="extensionBlocks" type="number" min={0} max={8} defaultValue={0} className={field} />
            </div>
          </div>
          <label htmlFor="technicianId" className={lbl}>Technician</label>
          <select id="technicianId" name="technicianId" className={field} defaultValue="auto">
            <option value="auto">Any available technician</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>{t.displayName}</option>
            ))}
          </select>
          <div className="grid gap-x-4 md:grid-cols-2">
            <div>
              <label htmlFor="status" className={lbl}>Initial status</label>
              <select id="status" name="status" className={field} defaultValue="CONFIRMED">
                <option value="CONFIRMED">Confirmed</option>
                <option value="REQUESTED">Requested (needs review)</option>
              </select>
            </div>
            <div>
              <label htmlFor="source" className={lbl}>Booked via</label>
              <select id="source" name="source" className={field}>
                <option value="PHONE">Phone call</option>
                <option value="ADMIN">Other / in person</option>
              </select>
            </div>
          </div>
          <label htmlFor="problemDescription" className={lbl}>What they need help with</label>
          <textarea id="problemDescription" name="problemDescription" rows={3} className={field} />
          <label htmlFor="leadSource" className={lbl}>Lead source</label>
          <input id="leadSource" name="leadSource" className={field} />
          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" name="allowOutsideHours" className="h-5 w-5" /> Allow booking outside business hours (still prevents overlaps)
          </label>
          <SubmitButton size="lg">Create appointment</SubmitButton>
        </Card>
      </form>
    </div>
  );
}

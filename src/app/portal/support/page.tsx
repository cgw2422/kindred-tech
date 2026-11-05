import { requirePermission } from "@/lib/auth/session";
import { getPortalAccess } from "@/lib/portal/access";
import { ButtonLink, Card } from "@/components/ui";
import { SupportForm } from "./SupportForm";

export const metadata = { title: "Request Help" };

export default async function SupportPage() {
  const user = await requirePermission("customer:portal", "/portal/support");
  const access = (await getPortalAccess(user)).filter((a) => a.self || a.canSchedule);
  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-3xl">Request help</h1>
      <p className="mb-6 text-lg">Have a quick question, or not sure which service you need? Send us a note and we will contact you. To pick a time right away, schedule a visit.</p>
      <div className="mb-6">
        <ButtonLink href="/schedule">Schedule a visit</ButtonLink>
      </div>
      <Card>
        <SupportForm people={access.map((a) => ({ id: a.customerId, name: a.self ? `Myself (${a.name})` : a.name }))} />
      </Card>
    </div>
  );
}

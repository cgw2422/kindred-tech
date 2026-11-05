import { requirePermission } from "@/lib/auth/session";
import { InvoiceList } from "@/components/billing/InvoiceList";
import { MembershipSummary } from "@/components/billing/MembershipSummary";

export const metadata = { title: "Billing & Membership" };

export default async function PortalBilling({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("customer:portal", "/portal/billing");
  const sp = await searchParams;
  return (
    <div>
      <h1 className="mb-2 text-3xl">Billing & membership</h1>
      <p className="mb-6">Card payments are processed securely by Stripe. We never see or store your card number.</p>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <InvoiceList user={user} returnPath="/portal/billing" billingError={sp.billingError ?? null} paidInvoiceId={sp.status === "success" ? "1" : null} />
        <MembershipSummary user={user} returnPath="/portal/billing" billingError={null} />
      </div>
    </div>
  );
}

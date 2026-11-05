import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { logoutAction } from "@/lib/auth/actions";
import { requirePortalUser } from "@/lib/facilities/portal-session";
import { PortalNav } from "./_components/PortalNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Community Portal", template: "%s | Kindred Community Portal" },
  robots: { index: false, follow: false },
};

export default async function FacilityLayout({ children }: { children: React.ReactNode }) {
  const { user, ctx } = await requirePortalUser("/facility");
  const items = [
    { href: "/facility", label: "Overview" },
    { href: "/facility/schedule", label: "Schedule" },
    { href: "/facility/request", label: "Request sessions" },
    ...(ctx.contact.canViewInvoices ? [{ href: "/facility/invoices", label: "Invoices" }] : []),
    { href: "/facility/agreement", label: "Agreement" },
    { href: "/facility/materials", label: "Flyers & newsletter" },
  ];
  return (
    <div className="min-h-screen bg-soft">
      <a href="#portal-main" className="skip-link">
        Skip to main content
      </a>
      <header className="no-print border-b border-line bg-white">
        <div className="container-site flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/facility" className="no-underline">
            <Logo />
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-[0.95rem]">
            <span>
              <span className="font-semibold text-navy">{ctx.facility.name}</span>
              <span className="block text-sm">Signed in as {user.name}</span>
            </span>
            <form action={logoutAction}>
              <button type="submit" className="font-semibold text-navy underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="container-site pb-3">
          <PortalNav items={items} />
        </div>
      </header>
      <main id="portal-main" className="container-site py-8">
        {children}
      </main>
    </div>
  );
}

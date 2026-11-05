import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { requirePermission } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "My Account", template: "%s | Kindred Tech Support" }, robots: { index: false } };

const NAV = [
  ["/portal", "Overview"],
  ["/portal/appointments", "Appointments"],
  ["/portal/billing", "Billing & membership"],
  ["/portal/support", "Request help"],
  ["/portal/profile", "My details"],
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("customer:portal", "/portal");
  const biz = await getSettings("business");
  return (
    <div className="flex min-h-screen flex-col bg-soft">
      <a href="#portal-main" className="skip-link">
        Skip to main content
      </a>
      <header className="border-b border-line bg-white">
        <div className="container-site flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" className="no-underline" aria-label="Kindred Tech Support home">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">Signed in as {user.name}</span>
            <form action={logoutAction}>
              <button className="rounded-md border-2 border-navy px-4 py-2 font-semibold text-navy">Sign out</button>
            </form>
          </div>
        </div>
        <nav aria-label="Account" className="container-site pb-3">
          <ul className="flex flex-wrap gap-2">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="block rounded-md px-3 py-2 font-semibold text-navy no-underline hover:bg-navy-50">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="portal-main" className="container-site flex-1 py-8">
        {children}
      </main>
      <footer className="border-t border-line bg-white py-5 text-center text-sm">
        Need help with your account? {biz.phone ? <>Call <a href={`tel:${biz.phone.replace(/[^\d+]/g, "")}`}>{biz.phone}</a>.</> : <Link href="/contact">Contact us</Link>}
      </footer>
    </div>
  );
}

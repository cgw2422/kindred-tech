import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { requirePermission } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";
import { logoutAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s | Kindred Admin" }, robots: { index: false, follow: false } };

const NAV: (NavItem & { perm: Permission })[] = [
  { href: "/admin", label: "Dashboard", group: "Overview", perm: "dashboard:view" },
  { href: "/admin/calendar", label: "Calendar", group: "Overview", perm: "appointments:view" },
  { href: "/admin/appointments", label: "Appointments", group: "Scheduling", perm: "appointments:view" },
  { href: "/admin/dispatch", label: "Dispatch & Routes", group: "Scheduling", perm: "dispatch:manage" },
  { href: "/admin/work-orders", label: "Work Orders", group: "Scheduling", perm: "appointments:view" },
  { href: "/admin/customers", label: "Customers", group: "People", perm: "customers:view" },
  { href: "/admin/leads", label: "Messages & Leads", group: "People", perm: "customers:view" },
  { href: "/admin/technicians", label: "Technicians", group: "People", perm: "technicians:manage" },
  { href: "/admin/facilities", label: "Senior Living", group: "Senior Living", perm: "facilities:view" },
  { href: "/admin/help-days", label: "Tech Help Days", group: "Senior Living", perm: "facilities:view" },
  { href: "/admin/invoices", label: "Invoices", group: "Billing", perm: "billing:view" },
  { href: "/admin/payments", label: "Payments", group: "Billing", perm: "billing:view" },
  { href: "/admin/memberships", label: "Memberships", group: "Billing", perm: "memberships:manage" },
  { href: "/admin/media", label: "Media Library", group: "Website", perm: "website:manage" },
  { href: "/admin/page-images", label: "Page Images", group: "Website", perm: "website:manage" },
  { href: "/admin/tech-tips", label: "Tech Tips", group: "Website", perm: "website:manage" },
  { href: "/admin/services", label: "Services & Pricing", group: "Configuration", perm: "services:manage" },
  { href: "/admin/email-templates", label: "Email Templates", group: "Configuration", perm: "templates:manage" },
  { href: "/admin/communications", label: "Communications", group: "Configuration", perm: "communications:view" },
  { href: "/admin/reports", label: "Reports", group: "Configuration", perm: "reports:view" },
  { href: "/admin/settings", label: "Settings", group: "Configuration", perm: "settings:manage" },
  { href: "/admin/users", label: "Users & Roles", group: "Configuration", perm: "users:manage" },
  { href: "/admin/audit", label: "Audit Log", group: "Configuration", perm: "audit:view" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("dashboard:view", "/admin");
  const items = NAV.filter((n) => can(user.role, n.perm)).map(({ href, label, group }) => ({ href, label, group }));
  return (
    <div className="min-h-screen bg-soft lg:flex">
      <a href="#admin-main" className="skip-link">
        Skip to main content
      </a>
      <aside className="no-print bg-navy-dark text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-center justify-between p-4">
          <Link href="/admin" className="no-underline">
            <Logo inverted compact />
          </Link>
        </div>
        <details className="px-3 pb-3 lg:hidden">
          <summary className="cursor-pointer rounded-md bg-white/10 px-3 py-2 font-semibold">Menu</summary>
          <div className="mt-2">
            <AdminNav items={items} />
          </div>
        </details>
        <div className="hidden px-3 pb-6 lg:block">
          <AdminNav items={items} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 md:px-8">
          <form action="/admin/search" method="get" role="search" className="flex w-full max-w-md gap-2">
            <label htmlFor="global-search" className="sr-only">
              Search customers, appointments, invoices, facilities
            </label>
            <input
              id="global-search"
              name="q"
              type="search"
              placeholder="Search customers, appointments, invoices..."
              className="w-full rounded-md border-2 border-line px-3 py-2 focus:border-navy focus:outline-none"
            />
            <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
              Search
            </button>
          </form>
          <div className="flex items-center gap-4 text-sm">
            {can(user.role, "tech:portal") && (
              <Link href="/tech" className="font-semibold">
                Technician view
              </Link>
            )}
            <span>
              {user.name} <span className="text-body/80">({user.role.toLowerCase()})</span>
            </span>
            <form action={logoutAction}>
              <button type="submit" className="font-semibold text-navy underline">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main id="admin-main" className="px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

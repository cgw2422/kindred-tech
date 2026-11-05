import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { LogoMark } from "@/components/brand/Logo";
import { can } from "@/lib/auth/permissions";
import { logoutAction } from "@/lib/auth/actions";
import { getTechContext } from "./_lib/context";
import { TechNav } from "./_components/TechNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Technician", template: "%s | Kindred Technician" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Kindred Tech", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#10375B", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const { user, technician } = await getTechContext();
  return (
    <div className="min-h-screen bg-soft">
      <a href="#tech-main" className="skip-link">
        Skip to main content
      </a>
      <header className="no-print sticky top-0 z-30 bg-navy-dark text-white">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/tech" className="flex min-h-[44px] items-center gap-2 text-white no-underline">
            <span className="inline-flex rounded-full bg-white p-0.5">
              <LogoMark size={28} />
            </span>
            <span className="font-heading text-lg font-bold">Kindred Tech</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {can(user.role, "dashboard:view") && (
              <Link href="/admin" className="font-semibold text-white">
                Admin
              </Link>
            )}
            <form action={logoutAction}>
              <button type="submit" className="min-h-[44px] rounded-md px-2 font-semibold text-white underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="tech-main" className="mx-auto max-w-xl px-4 pt-4 pb-28">
        {technician ? (
          children
        ) : (
          <div className="rounded-lg border border-line bg-white p-6 text-center">
            <h1 className="text-2xl">Welcome, {user.name.split(" ")[0]}</h1>
            <p className="mt-3">
              Your account isn&apos;t linked to a technician profile yet, so there are no jobs to show here.
            </p>
            <p className="mt-2">
              An owner or administrator can add a technician profile for you under <strong>Technicians</strong> in the admin area.
            </p>
            {can(user.role, "dashboard:view") && (
              <p className="mt-4">
                <Link href="/admin" className="font-semibold">
                  Go to the admin dashboard
                </Link>
              </p>
            )}
          </div>
        )}
      </main>
      {technician && <TechNav />}
    </div>
  );
}

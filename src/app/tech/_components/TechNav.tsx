"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/tech", label: "Today", icon: "M3 10h18M7 3v4m10-4v4M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" },
  { href: "/tech/schedule", label: "Week", icon: "M4 6h16M4 12h16M4 18h16" },
];

/** Bottom navigation for the technician portal (large tap targets). */
export function TechNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Technician" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-xl">
        {ITEMS.map((item) => {
          const active = item.href === "/tech" ? pathname === "/tech" || pathname.startsWith("/tech/appointments") : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 text-sm font-semibold no-underline ${active ? "text-green-dark" : "text-navy"}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                {item.label}
                {active && <span className="sr-only">(current page)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PortalNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Community portal" className="no-print">
      <ul className="flex flex-wrap gap-1">
        {items.map((item) => {
          const active = item.href === "/facility" ? pathname === "/facility" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 font-semibold no-underline ${active ? "bg-navy text-white" : "text-navy hover:bg-navy-50"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; group: string };

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Admin">
      {groups.map((g) => (
        <div key={g} className="mb-4">
          <p className="mb-1 px-3 text-xs font-bold uppercase tracking-wider text-white/60">{g}</p>
          <ul>
            {items
              .filter((i) => i.group === g)
              .map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-md px-3 py-2 text-[0.95rem] no-underline ${active ? "bg-white font-semibold text-navy" : "text-white hover:bg-white/10"}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

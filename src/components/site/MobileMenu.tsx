"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClass } from "@/components/ui";

type Item = { href: string; label: string };

/** Menu button and panel for phones, tablets, and larger text sizes. */
export function MobileMenu({ items, phone }: { items: Item[]; phone?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close after navigating to another page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="site-nav-toggle xl:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass("outline", "md")}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        {open ? "Close" : "Menu"}
      </button>
      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 max-h-[calc(100vh-6rem)] overflow-y-auto border-y border-line bg-white shadow-lg"
      >
        <nav aria-label="Main" className="container-site py-4">
          <ul className="grid gap-1 sm:grid-cols-2">
            {items.map((item) => {
              const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-[52px] items-center rounded-md px-4 text-lg font-semibold no-underline ${current ? "bg-navy-50 text-navy underline" : "text-navy hover:bg-navy-50"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row">
            <Link href="/schedule" className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
              Schedule a Visit
            </Link>
            {phone && (
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={buttonClass("outline", "lg", "w-full sm:w-auto")} aria-label={`Call Kindred at ${phone}`}>
                Call Kindred: {phone}
              </a>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}

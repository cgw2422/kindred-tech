import Link from "next/link";

/** Horizontal tab-style links for configuration sub-pages. */
export function SubNav({ items, current, label }: { items: { href: string; label: string }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1">
        {items.map((i) => {
          const active = i.href === current;
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block rounded-t-md px-4 py-2.5 font-semibold no-underline ${active ? "border-x border-t border-line bg-white text-navy" : "text-body hover:bg-white hover:text-navy"}`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Previous/next pagination that preserves the current query string. */
export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-body">
        {total === 0 ? "No results" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="rounded-md border-2 border-navy px-4 py-2 font-semibold no-underline">
            ← Previous
          </Link>
        ) : null}
        <span className="px-2 py-2 text-body">
          Page {Math.min(page, pages)} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className="rounded-md border-2 border-navy px-4 py-2 font-semibold no-underline">
            Next →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export const SERVICES_NAV = [
  { href: "/admin/services", label: "Services" },
  { href: "/admin/services/categories", label: "Categories" },
  { href: "/admin/services/addons", label: "Add-ons" },
  { href: "/admin/services/bundles", label: "Bundles" },
  { href: "/admin/services/discounts", label: "Discounts" },
  { href: "/admin/services/areas", label: "Service Areas" },
];

export const SETTINGS_NAV = [
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/settings/closures", label: "Holidays & Closures" },
];

export const COMMS_NAV = [
  { href: "/admin/communications", label: "Communication Log" },
  { href: "/admin/communications/log", label: "Log a Call or Note" },
  { href: "/admin/communications/jobs", label: "Background Jobs" },
];

export function sp(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : undefined;
}

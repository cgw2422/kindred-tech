import Link from "next/link";
import { buttonClass } from "@/components/ui";

const LINKS = [
  { href: "/services", label: "Our services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "Frequently asked questions" },
  { href: "/contact", label: "Contact us" },
];

/** Body of the 404 page, shared by the root and public-group not-found files. */
export function NotFoundContent() {
  return (
    <div className="container-site py-16 md:py-24">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">Page not found</p>
        <h1 className="mt-2 text-3xl md:text-4xl">We could not find that page</h1>
        <p className="mt-4 text-lg">The link may be out of date, or the address may have a small typo. Here are some places to start instead.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className={buttonClass("primary", "lg")}>
            Go to the Home Page
          </Link>
          <Link href="/schedule" className={buttonClass("outline", "lg")}>
            Schedule a Visit
          </Link>
        </div>
        <nav aria-label="Helpful links" className="mt-10">
          <ul className="space-y-3 text-lg">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

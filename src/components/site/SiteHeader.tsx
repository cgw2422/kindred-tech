import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui";

export const SERVICE_NAV = [
  { href: "/services/computer-laptop-support", label: "Computer & Laptop Support" },
  { href: "/services/smartphone-tablet-help", label: "Smartphone & Tablet Help" },
  { href: "/services/wifi-internet-support", label: "Wi-Fi & Internet Support" },
  { href: "/services/smart-tv-streaming-setup", label: "Smart TV & Streaming Setup" },
  { href: "/services/technology-lessons", label: "Personal Technology Lessons" },
  { href: "/services/online-safety-scam-protection", label: "Online Safety & Scam Protection" },
  { href: "/services/subscription-review-savings", label: "Subscription Review & Savings" },
  { href: "/services/technology-checkup", label: "Technology Checkup" },
];

const MAIN_NAV = [
  { href: "/services", label: "Services" },
  { href: "/senior-living", label: "Senior Living" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ phone }: { phone?: string }) {
  return (
    <header className="border-b border-line bg-white">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {phone && (
        <div className="bg-navy text-white">
          <div className="container-site flex items-center justify-end py-1.5 text-sm">
            <span>
              Call us:{" "}
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-white underline">
                {phone}
              </a>
            </span>
          </div>
        </div>
      )}
      <div className="container-site flex items-center justify-between gap-4 py-4">
        <Link href="/" className="no-underline">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="rounded-md px-3 py-2 font-semibold text-navy no-underline hover:bg-navy-50">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/login" className="rounded-md px-3 py-2 font-semibold text-navy no-underline hover:bg-navy-50">
                Sign In
              </Link>
            </li>
            <li className="ml-2">
              <Link href="/schedule" className={buttonClass("primary", "md")}>
                Schedule a Visit
              </Link>
            </li>
          </ul>
        </nav>
        <details className="relative lg:hidden">
          <summary className={buttonClass("outline", "md", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>Menu</summary>
          <nav aria-label="Mobile" className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-line bg-white p-3 shadow-lg">
            <ul className="flex flex-col">
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block rounded-md px-3 py-3 font-semibold text-navy no-underline hover:bg-navy-50">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/login" className="block rounded-md px-3 py-3 font-semibold text-navy no-underline hover:bg-navy-50">
                  Sign In
                </Link>
              </li>
              <li className="mt-2">
                <Link href="/schedule" className={buttonClass("primary", "md", "w-full")}>
                  Schedule a Visit
                </Link>
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}

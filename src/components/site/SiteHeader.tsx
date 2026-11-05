import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui";
import { DisplayControls } from "@/components/a11y/DisplayControls";
import { MobileMenu } from "./MobileMenu";

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
  { href: "/tech-tips", label: "Tech Tips" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ phone }: { phone?: string }) {
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;
  return (
    <header className="relative border-b border-line bg-white">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="no-print bg-navy text-white">
        <div className="container-site flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
          <DisplayControls />
          {phone && tel && (
            <a href={tel} className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-white underline" aria-label={`Call Kindred at ${phone}`}>
              <span aria-hidden="true">Call Kindred:</span> {phone}
            </a>
          )}
        </div>
      </div>
      <div className="container-site flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4">
        <Link href="/" className="min-w-0 no-underline">
          <Logo />
        </Link>
        <nav aria-label="Main" className="site-nav-desktop hidden xl:block">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-[48px] items-center rounded-md px-2.5 font-semibold whitespace-nowrap text-navy no-underline hover:bg-navy-50 hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/login" className="inline-flex min-h-[48px] items-center rounded-md px-2.5 font-semibold whitespace-nowrap text-navy no-underline hover:bg-navy-50 hover:underline">
                Sign In
              </Link>
            </li>
            <li className="ml-2">
              <Link href="/schedule" className={buttonClass("primary", "md", "whitespace-nowrap")}>
                Schedule a Visit
              </Link>
            </li>
          </ul>
        </nav>
        <MobileMenu items={[...MAIN_NAV, { href: "/login", label: "Sign In" }]} phone={phone} />
      </div>
    </header>
  );
}

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import type { Settings } from "@/lib/settings";
import { SERVICE_NAV } from "./SiteHeader";

export function SiteFooter({ business }: { business: Settings<"business"> }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 bg-navy-dark text-white">
      <div className="container-site grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo inverted />
          <p className="mt-4 text-green-light">{business.tagline}</p>
          <p className="mt-2 text-white/90">Serving East-Central and Northeast Ohio. Based in Tuscarawas County.</p>
        </div>
        <div>
          <h2 className="mb-3 font-heading text-lg text-white">Services</h2>
          <ul className="space-y-3">
            {SERVICE_NAV.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="text-white/90 hover:text-white">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-heading text-lg text-white">Company</h2>
          <ul className="space-y-3">
            {[
              ["/about", "About"],
              ["/senior-living", "Senior Living Communities"],
              ["/senior-living#inquiry", "Request a Partnership Proposal"],
              ["/pricing", "Pricing"],
              ["/service-areas", "Service Areas"],
              ["/faq", "Frequently Asked Questions"],
              ["/contact", "Contact"],
              ["/schedule", "Schedule a Visit"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-white/90 hover:text-white">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-heading text-lg text-white">Contact</h2>
          <ul className="space-y-3 text-white/90">
            {business.phone && (
              <li>
                Phone:{" "}
                <a className="text-white" href={`tel:${business.phone.replace(/[^\d+]/g, "")}`}>
                  {business.phone}
                </a>
              </li>
            )}
            {business.email && (
              <li>
                Email:{" "}
                <a className="text-white" href={`mailto:${business.email}`}>
                  {business.email}
                </a>
              </li>
            )}
            {business.showAddressPublicly && business.addressLine && (
              <li>
                {business.addressLine}, {business.city}, {business.state} {business.postalCode}
              </li>
            )}
            <li>{business.hoursDescription}</li>
            <li>
              <Link href="/contact" className="text-white">
                Contact Kindred
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="container-site flex flex-col gap-2 py-5 text-white/85 md:flex-row md:justify-between">
          <p>
            &copy; {year} {business.name}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-4">
            <li>
              <Link href="/privacy" className="text-white/90">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-white/90">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/accessibility" className="text-white/90">
                Accessibility
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

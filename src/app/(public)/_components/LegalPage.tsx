import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import type { Settings } from "@/lib/settings";
import { telHref } from "../_lib/format";

/** Shared shell for policy pages. */
export function LegalPage({ title, updated, template = false, children }: { title: string; updated?: string; template?: boolean; children: ReactNode }) {
  return (
    <div className="container-site py-12 md:py-16">
      <article className="max-w-3xl">
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm">Last updated: {updated}</p>}
        {template && (
          <div className="mt-6">
            <Notice tone="warn" title="Template: owner and legal review required">
              This page is a starting template written in plain language. It must be reviewed and adapted by the business owner and a qualified attorney before it is
              relied upon.
            </Notice>
          </div>
        )}
        <div className="prose-kindred mt-8 text-[1.02rem]">{children}</div>
      </article>
    </div>
  );
}

/** Contact lines for policy pages, omitting anything that has not been configured. */
export function ContactLines({ business }: { business: Settings<"business"> }) {
  const hasAddress = business.showAddressPublicly && business.addressLine;
  return (
    <ul>
      <li>
        By using the <Link href="/contact">contact form on our website</Link>
      </li>
      {business.email && (
        <li>
          By email at <a href={`mailto:${business.email}`}>{business.email}</a>
        </li>
      )}
      {business.phone && (
        <li>
          By phone at <a href={telHref(business.phone)}>{business.phone}</a>
        </li>
      )}
      {hasAddress && (
        <li>
          By mail at {business.addressLine}, {business.city}, {business.state} {business.postalCode}
        </li>
      )}
    </ul>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";

/** Top-of-page introduction used on inner marketing pages. */
export function PageIntro({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-line bg-white" aria-labelledby="page-title">
      <div className="container-site py-12 md:py-16">
        {eyebrow && <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-green-dark">{eyebrow}</p>}
        <h1 id="page-title" className="max-w-3xl text-3xl md:text-[2.6rem]">
          {title}
        </h1>
        {children && <div className="mt-4 max-w-3xl text-lg md:text-xl">{children}</div>}
        {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  );
}

/** A titled content section with consistent spacing. */
export function Section({ id, title, intro, children, tone = "soft", className = "" }: { id: string; title: string; intro?: ReactNode; children: ReactNode; tone?: "soft" | "white"; className?: string }) {
  return (
    <section aria-labelledby={id} className={`${tone === "white" ? "border-y border-line bg-white" : ""} ${className}`}>
      <div className="container-site py-12 md:py-16">
        <h2 id={id} className="text-2xl md:text-3xl">
          {title}
        </h2>
        {intro && <div className="mt-3 max-w-3xl text-lg">{intro}</div>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

/** Bulleted list with check-style markers that read well with screen readers. */
export function CheckList({ items, columns = 1 }: { items: ReactNode[]; columns?: 1 | 2 }) {
  return (
    <ul className={`grid gap-3 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" className="mt-1.5 h-5 w-5 shrink-0 text-green">
            <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Closing call to action band. */
export function CtaBand({ title = "Ready for some friendly help?", children, scheduleHref = "/schedule", secondary }: { title?: string; children?: ReactNode; scheduleHref?: string; secondary?: { href: string; label: string } }) {
  return (
    <section aria-labelledby="cta-title" className="bg-navy text-white">
      <div className="container-site flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between md:py-14">
        <div className="max-w-2xl">
          <h2 id="cta-title" className="text-2xl text-white md:text-3xl">
            {title}
          </h2>
          <div className="mt-3 text-lg text-white/90">{children ?? "Choose a time that works for you. We will confirm your visit and answer any questions before we arrive."}</div>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={scheduleHref} variant="light" size="lg">
            Schedule a Visit
          </ButtonLink>
          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex min-h-[52px] items-center justify-center rounded-md border-2 border-white px-7 py-3.5 text-lg font-semibold text-white no-underline transition-colors hover:bg-white/10"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** Accessible FAQ list using native disclosure widgets. */
export function FaqList({ items, headingLevel = 3 }: { items: { question: string; answer: ReactNode }[]; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-white">
      {items.map((item) => (
        <details key={item.question} className="group px-5 py-1 md:px-6">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 py-3 [&::-webkit-details-marker]:hidden">
            <H className="font-sans text-lg font-semibold text-navy">{item.question}</H>
            <span aria-hidden="true" className="shrink-0 text-2xl leading-none text-green group-open:rotate-45 transition-transform">
              +
            </span>
          </summary>
          <div className="pb-5 text-[1.02rem]">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}

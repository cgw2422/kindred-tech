import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { NotFoundContent } from "./(public)/_components/NotFoundContent";

export const metadata: Metadata = { title: "Page Not Found", robots: { index: false } };

/** Global 404 for unmatched URLs. Renders outside the public layout, so it includes a minimal header. */
export default function NotFound() {
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="container-site py-4">
          <Link href="/" className="inline-block no-underline" aria-label="Kindred Tech Support home">
            <Logo />
          </Link>
        </div>
      </header>
      <main id="main">
        <NotFoundContent />
      </main>
    </>
  );
}

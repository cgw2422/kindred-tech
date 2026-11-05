import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { UnsubscribeForm } from "./UnsubscribeForm";

export const metadata: Metadata = {
  title: "Email Preferences",
  description: "Unsubscribe from Kindred Tech Support marketing emails.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/unsubscribe" },
};

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token.trim().slice(0, 100) : "";
  const customer = token ? await prisma.customer.findUnique({ where: { unsubscribeToken: token }, select: { marketingOptIn: true } }) : null;

  return (
    <div className="container-site py-12 md:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl md:text-4xl">Email preferences</h1>
        {!customer ? (
          <div className="mt-6 space-y-4 text-lg">
            <p>We could not find this unsubscribe link. It may be incomplete or out of date.</p>
            <p>
              Please <Link href="/contact">contact us</Link> and we will update your email preferences for you.
            </p>
          </div>
        ) : !customer.marketingOptIn ? (
          <div className="mt-6 space-y-4 text-lg">
            <p>You are not subscribed to our marketing emails, so there is nothing more you need to do.</p>
            <p>You will still receive transactional messages, such as appointment confirmations, reminders, and invoices.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-5 text-lg">
            <p>Would you like to stop receiving marketing emails, such as tips and news about our services?</p>
            <p>
              Unsubscribing does not affect transactional messages. You will still receive appointment confirmations, reminders, invoices, and other messages about your
              service.
            </p>
            <UnsubscribeForm token={token} />
          </div>
        )}
        <p className="mt-10">
          <Link href="/">Return to the home page</Link>
        </p>
      </div>
    </div>
  );
}

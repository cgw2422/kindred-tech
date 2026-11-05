"use server";

import { redirect } from "next/navigation";
import { findInvoiceByPayToken } from "@/lib/billing/invoices";
import { clientIp } from "@/lib/auth/session";
import { fd } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";
import { createInvoiceCheckoutSession, isStripeConfigured } from "@/lib/payments/stripe";

/** Public "Pay securely with card": creates a Checkout Session for the invoice behind the token and redirects to Stripe. */
export async function payInvoiceByTokenAction(formData: FormData) {
  const token = fd(formData, "token");
  const back = `/pay/${encodeURIComponent(token)}`;
  let url: string;
  try {
    if (!isStripeConfigured()) redirect(`${back}?error=not_configured`);
    const ip = (await clientIp()) ?? "unknown";
    if (!(await rateLimit(`pay:${ip}`, 20, 600))) redirect(`${back}?error=rate_limited`);
    const inv = await findInvoiceByPayToken(token);
    if (!inv) redirect(`${back}?error=not_found`);
    const session = await createInvoiceCheckoutSession(inv.id, { payToken: token, payDeposit: fd(formData, "deposit") === "1" });
    url = session.url;
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    console.error("[pay] checkout failed:", (err as Error).message);
    redirect(`${back}?error=${(err as Error).name === "InvoiceError" ? "not_payable" : "checkout_failed"}`);
  }
  redirect(url);
}

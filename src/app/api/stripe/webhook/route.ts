import Stripe from "stripe";
import { env } from "@/lib/env";
import { processStripeEvent } from "@/lib/payments/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Stripe webhook endpoint. The raw body is verified against
 * STRIPE_WEBHOOK_SECRET before anything is processed.
 *  - 503 when webhooks are not configured
 *  - 400 on a missing or invalid signature
 *  - 200 once processed (or already processed)
 *  - 409 when another delivery of the same event is mid-processing
 *  - 500 on a processing error so Stripe retries
 */
export async function POST(req: Request) {
  const secret = env.stripeWebhookSecret;
  if (!secret) return json({ error: "Stripe webhooks are not configured." }, 503);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe-Signature header." }, 400);
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return json({ error: "Invalid signature." }, 400);
  }

  try {
    const result = await processStripeEvent(event);
    if (result.status === "busy") return json({ received: true, status: "busy" }, 409);
    return json({ received: true, status: result.status }, 200);
  } catch (err) {
    console.error(`[stripe] failed to process ${event.type} ${event.id}:`, (err as Error).message);
    return json({ error: "Processing failed." }, 500);
  }
}

import { env } from "../env";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string; idempotencyKey?: string; headers?: Record<string, string> };

export type SendResult =
  | { status: "SENT"; provider: string; providerMessageId: string | null }
  | { status: "SKIPPED"; reason: string };

export interface EmailProvider {
  name: string;
  send(email: OutgoingEmail): Promise<{ id: string | null }>;
}

class ResendProvider implements EmailProvider {
  name = "resend";
  constructor(private apiKey: string, private from: string, private replyTo?: string) {}
  async send(email: OutgoingEmail) {
    const { Resend } = await import("resend");
    const client = new Resend(this.apiKey);
    const { data, error } = await client.emails.send(
      {
        from: this.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: this.replyTo,
        headers: email.headers,
      },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey.slice(0, 256) } : undefined,
    );
    if (error) throw new Error(`Resend error: ${error.message}`);
    return { id: data?.id ?? null };
  }
}

/** Test hook: lets integration tests capture outgoing mail without a provider. */
let testProvider: EmailProvider | null = null;
export function setTestEmailProvider(p: EmailProvider | null) {
  testProvider = p;
}

export function getEmailProvider(): EmailProvider | null {
  if (testProvider) return testProvider;
  if (env.resendApiKey && env.emailFrom) return new ResendProvider(env.resendApiKey, env.emailFrom, env.emailReplyTo);
  return null;
}

/**
 * Delivery gate. Live email is only sent when a provider is configured AND the
 * delivery mode allows the recipient. Default mode is "disabled".
 */
export function deliveryDecision(to: string): { allowed: true } | { allowed: false; reason: string } {
  if (testProvider) return { allowed: true };
  if (!env.resendApiKey || !env.emailFrom) return { allowed: false, reason: "Email provider not configured (RESEND_API_KEY / EMAIL_FROM)." };
  const mode = env.emailDeliveryMode;
  if (mode === "disabled") return { allowed: false, reason: "EMAIL_DELIVERY_MODE is disabled." };
  if (mode === "allowlist" && !env.emailAllowlist.includes(to.toLowerCase())) {
    return { allowed: false, reason: "Recipient is not on EMAIL_ALLOWLIST." };
  }
  return { allowed: true };
}

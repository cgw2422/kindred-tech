/**
 * Central access to environment configuration and integration status.
 * Never log or expose the secret values themselves.
 */
function str(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  get appUrl() {
    return (str("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get stripeSecretKey() {
    return str("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return str("STRIPE_WEBHOOK_SECRET");
  },
  get resendApiKey() {
    return str("RESEND_API_KEY");
  },
  get emailFrom() {
    return str("EMAIL_FROM");
  },
  get emailReplyTo() {
    return str("EMAIL_REPLY_TO");
  },
  /** disabled | allowlist | live */
  get emailDeliveryMode(): "disabled" | "allowlist" | "live" {
    const m = str("EMAIL_DELIVERY_MODE");
    return m === "live" || m === "allowlist" ? m : "disabled";
  },
  get emailAllowlist(): string[] {
    return (str("EMAIL_ALLOWLIST") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get mapsProvider(): "google" | "mapbox" | "none" {
    if (str("GOOGLE_MAPS_API_KEY")) return "google";
    if (str("MAPBOX_ACCESS_TOKEN")) return "mapbox";
    return "none";
  },
  get googleMapsApiKey() {
    return str("GOOGLE_MAPS_API_KEY");
  },
  get mapboxToken() {
    return str("MAPBOX_ACCESS_TOKEN");
  },
  get cronSecret() {
    return str("CRON_SECRET");
  },
  get s3() {
    const bucket = str("S3_BUCKET");
    if (!bucket || !str("S3_ACCESS_KEY_ID") || !str("S3_SECRET_ACCESS_KEY")) return undefined;
    return {
      bucket,
      region: str("S3_REGION") ?? "auto",
      endpoint: str("S3_ENDPOINT"),
      accessKeyId: str("S3_ACCESS_KEY_ID")!,
      secretAccessKey: str("S3_SECRET_ACCESS_KEY")!,
    };
  },
};

export function integrationStatus() {
  return {
    stripe: Boolean(env.stripeSecretKey),
    stripeWebhooks: Boolean(env.stripeSecretKey && env.stripeWebhookSecret),
    email: Boolean(env.resendApiKey && env.emailFrom),
    emailMode: env.emailDeliveryMode,
    maps: env.mapsProvider,
    storage: Boolean(env.s3),
    sms: false,
  };
}

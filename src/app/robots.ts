import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/tech", "/portal", "/facility", "/api", "/pay", "/appointments", "/account", "/login", "/forgot-password", "/unsubscribe", "/auth"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}

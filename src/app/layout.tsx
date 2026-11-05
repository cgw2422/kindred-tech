import type { Metadata, Viewport } from "next";
import { Libre_Baskerville, Open_Sans } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

const libre = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-libre", display: "swap" });
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: "Kindred Tech Support | In-Home Technology Help in Tuscarawas County, Ohio",
    template: "%s | Kindred Tech Support",
  },
  description:
    "Friendly, patient technology help in the comfort of your own home. Computer, smartphone, Wi-Fi, TV, and online safety help for seniors and families in Tuscarawas County, Ohio.",
  applicationName: "Kindred Tech Support",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  openGraph: { type: "website", siteName: "Kindred Tech Support", locale: "en_US" },
};

export const viewport: Viewport = {
  themeColor: "#10375B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${libre.variable} ${openSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}

export const dynamic = "force-dynamic";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getSettings } from "@/lib/settings";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const business = await getSettings("business");
  return (
    <>
      <SiteHeader phone={business.phone || undefined} />
      <main id="main">{children}</main>
      <SiteFooter business={business} />
    </>
  );
}

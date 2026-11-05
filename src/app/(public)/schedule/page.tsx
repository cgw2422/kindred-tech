import type { Metadata } from "next";
import { loadBookableServices } from "@/lib/booking/public";
import { getSettings } from "@/lib/settings";
import { BookingWizard, type WizardService } from "./BookingWizard";

export const metadata: Metadata = {
  title: "Schedule a Visit",
  description: "Request an in-home or remote technology help appointment with Kindred Tech Support in Tuscarawas County, Ohio. No account needed.",
  alternates: { canonical: "/schedule" },
};

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const sp = await searchParams;
  const [services, cancellation, business, booking] = await Promise.all([
    loadBookableServices(),
    getSettings("cancellation"),
    getSettings("business"),
    getSettings("booking"),
  ]);
  const wizardServices: WizardService[] = services.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    shortDescription: s.shortDescription,
    pricingType: s.pricingType,
    basePriceCents: s.basePriceCents,
    durationMinutes: s.durationMinutes,
    extensionMinutes: s.extensionMinutes,
    extensionPriceCents: s.extensionPriceCents,
    isRemote: s.isRemote,
    addons: s.addons.map((a) => ({ id: a.id, name: a.name, priceCents: a.priceCents })),
  }));
  const initial = wizardServices.find((s) => s.slug === sp.service)?.id;
  return (
    <div className="container-site py-10">
      <h1 className="mb-2 text-3xl md:text-4xl">Schedule a Visit</h1>
      <p className="mb-8 max-w-3xl text-lg">
        Tell us a little about what you need and pick a time that works. You do not need an account. Family members are welcome to book for a parent or loved one.
        {business.phone ? (
          <>
            {" "}
            Prefer to talk to someone? Call{" "}
            <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`} className="font-semibold">
              {business.phone}
            </a>
            .
          </>
        ) : null}
      </p>
      <BookingWizard
        services={wizardServices}
        initialServiceId={initial}
        cancellationPolicy={cancellation.policyText}
        minNoticeHours={booking.minNoticeHours}
        timeZone={business.timeZone}
      />
    </div>
  );
}

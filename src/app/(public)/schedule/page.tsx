import type { Metadata } from "next";
import { loadBookableServices } from "@/lib/booking/public";
import { getSettings } from "@/lib/settings";
import { CallButton } from "@/components/site/CallButton";
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
      <p className="measure mb-6 text-lg">
        Tell us a little about what you need and pick a time that works. You do not need an account. Family members are welcome to book for a parent or loved one.
      </p>
      <section aria-labelledby="how-booking-works" className="mb-8 rounded-lg border border-line bg-green-light p-5">
        <h2 id="how-booking-works" className="text-xl">
          How booking works
        </h2>
        <ol className="mt-3 grid list-decimal gap-x-8 gap-y-1 pl-6 md:grid-cols-2">
          <li>Choose the kind of help you need.</li>
          <li>Tell us who the visit is for and where.</li>
          <li>Pick a day and time that suits you.</li>
          <li>Review the details and send your request.</li>
        </ol>
        <p className="mt-3">You can go back to any step to make changes. Nothing is charged today, and we confirm every appointment with you.</p>
      </section>
      {business.phone && (
        <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line bg-white p-4 md:p-5">
          <p className="text-lg font-semibold text-navy">Prefer to book by phone?</p>
          <CallButton phone={business.phone} size="md" />
        </div>
      )}
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

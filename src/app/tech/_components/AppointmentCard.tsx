import Link from "next/link";
import { AppointmentStatusBadge } from "@/components/status";
import { addressLine, mapsUrl, shortCustomerName, telHref, type TechListAppointment } from "@/lib/tech/access";
import { formatTime } from "@/lib/time";

const actionClass = "flex min-h-[48px] flex-1 items-center justify-center rounded-md border-2 px-3 text-center font-semibold whitespace-nowrap no-underline";

export function AppointmentCard({ appt, tz }: { appt: TechListAppointment; tz: string }) {
  const address = addressLine(appt.address);
  const tel = telHref(appt.customer.phone);
  const name = shortCustomerName(appt.customer);
  return (
    <article className="rounded-lg border border-line bg-white p-4" aria-labelledby={`appt-${appt.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-heading text-xl text-navy">
          {formatTime(appt.startsAt, tz)}
          <span className="text-base font-normal text-body"> – {formatTime(appt.endsAt, tz)}</span>
        </p>
        <AppointmentStatusBadge status={appt.status} />
      </div>
      <h3 id={`appt-${appt.id}`} className="mt-1 text-lg">
        <Link href={`/tech/appointments/${appt.id}`} className="no-underline hover:underline">
          {name}
        </Link>
      </h3>
      <p className="text-body">{appt.service.name}</p>
      {appt.isRemote ? <p className="mt-1 text-body">Remote session</p> : address && <p className="mt-1 text-body">{address}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/tech/appointments/${appt.id}`} className={`${actionClass} border-green bg-green text-white`}>
          Open job
        </Link>
        {!appt.isRemote && address && (
          <a href={mapsUrl(address)} target="_blank" rel="noopener noreferrer" className={`${actionClass} border-navy text-navy`}>
            Directions<span className="sr-only"> to {name} (opens Google Maps)</span>
          </a>
        )}
        {tel && (
          <a href={tel} className={`${actionClass} border-navy text-navy`}>
            Call<span className="sr-only"> {name}</span>
          </a>
        )}
      </div>
    </article>
  );
}

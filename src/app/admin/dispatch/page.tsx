import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { AppointmentStatusBadge } from "@/components/status";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { addDaysToKey, formatDateKeyLong, formatTime, toDateKey } from "@/lib/time";
import { formatAddressForMaps, getMapsProvider, googleDirectionsUrl } from "@/lib/maps/provider";
import { loadDispatchDay, planTechnicianRoute, type TechRoute } from "@/lib/routing/dispatch";
import { groupNearby, haversineMiles, metersToMiles } from "@/lib/routing/optimize";
import { calculateRoutesAction, dispatchAssignAction, geocodeDayAction, moveStopAction, resetOrderAction } from "./actions";

export const metadata = { title: "Dispatch & Routes" };

export default async function DispatchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("dispatch:manage", "/admin/dispatch");
  const sp = await searchParams;
  const flash = readFlash(sp);
  const biz = await getSettings("business");
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : toDateKey(new Date(), biz.timeZone);
  const day = await loadDispatchDay(date);
  const tz = day.timeZone;
  const provider = getMapsProvider();
  const techFilter = sp.tech ?? "";

  // Read-only plans (no provider calls on page load; use "Recalculate" to fetch drive times).
  const routes: TechRoute[] = [];
  for (const t of day.technicians) {
    if (techFilter && t.id !== techFilter) continue;
    routes.push(await planTechnicianRoute({ technicianId: t.id, dateKey: date, appointments: day.appointments, useProvider: false, save: false }));
  }
  const unassigned = day.appointments.filter((a) => !a.technicianId);
  const remote = day.appointments.filter((a) => a.isRemote && a.technicianId);
  const located = day.appointments.filter((a) => a.address?.lat != null && a.address?.lng != null);
  const groups = groupNearby(
    day.appointments.filter((a) => !a.isRemote).map((a) => ({ id: a.id, lat: a.address?.lat ?? null, lng: a.address?.lng ?? null, area: a.address?.city ?? null })),
    5,
  ).filter((g) => g.length > 1);

  // Schematic plot bounds
  const lats = located.map((a) => a.address!.lat!);
  const lngs = located.map((a) => a.address!.lng!);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 600, H = 360, pad = 30;
  const x = (lng: number) => pad + ((lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * pad);
  const y = (lat: number) => H - pad - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * pad);

  return (
    <div>
      <PageHeader
        title="Dispatch & route planning"
        description={formatDateKeyLong(date)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/dispatch?date=${addDaysToKey(date, -1)}`} className="rounded-md border-2 border-navy px-3 py-1.5 font-semibold no-underline">
              Previous day
            </Link>
            <Link href={`/admin/dispatch?date=${addDaysToKey(date, 1)}`} className="rounded-md border-2 border-navy px-3 py-1.5 font-semibold no-underline">
              Next day
            </Link>
          </div>
        }
      />
      <Flash flash={flash} />
      {provider ? (
        <Notice tone="green" title={`Maps provider: ${provider.name === "google" ? "Google Maps Platform" : "Mapbox"}`}>
          Use &quot;Locate addresses&quot; and &quot;Recalculate routes&quot; to fetch drive times. Appointment times are never moved automatically.
        </Notice>
      ) : (
        <Notice tone="warn" title="Manual dispatch mode">
          No maps provider is configured, so drive times and mileage are not calculated. Stops are ordered by appointment time, and nearby jobs are grouped by city or by saved coordinates. Add GOOGLE_MAPS_API_KEY or MAPBOX_ACCESS_TOKEN to enable estimates.
        </Notice>
      )}
      <form method="get" className="my-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="date" className="block text-sm font-semibold text-navy">Date</label>
          <input id="date" name="date" type="date" defaultValue={date} className="rounded-md border-2 border-line px-3 py-2" />
        </div>
        <div>
          <label htmlFor="tech" className="block text-sm font-semibold text-navy">Technician</label>
          <select id="tech" name="tech" defaultValue={techFilter} className="rounded-md border-2 border-line px-3 py-2">
            <option value="">All technicians</option>
            {day.technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.displayName}</option>
            ))}
          </select>
        </div>
        <button className="rounded-md bg-navy px-4 py-2 font-semibold text-white">Show</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-3">
        <form action={geocodeDayAction}>
          <input type="hidden" name="date" value={date} />
          <SubmitButton variant="outline" size="md" pendingText="Locating...">Locate addresses</SubmitButton>
        </form>
        <form action={calculateRoutesAction}>
          <input type="hidden" name="date" value={date} />
          <SubmitButton size="md" pendingText="Calculating...">Recalculate routes</SubmitButton>
        </form>
      </div>

      {unassigned.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 text-xl">Unassigned ({unassigned.length})</h2>
          <ul className="divide-y divide-line">
            {unassigned.map((a) => {
              const suggestions = routes
                .map((r) => {
                  const techAppts = day.appointments.filter((x) => x.technicianId === r.technicianId && x.address?.lat != null);
                  const d = a.address?.lat != null ? Math.min(...techAppts.map((x) => haversineMiles({ lat: a.address!.lat!, lng: a.address!.lng! }, { lat: x.address!.lat!, lng: x.address!.lng! }))) : Infinity;
                  return { id: r.technicianId, d };
                })
                .filter((s) => Number.isFinite(s.d))
                .sort((p, q) => p.d - q.d);
              const best = suggestions[0];
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/admin/appointments/${a.id}`} className="font-semibold">
                      {formatTime(a.startsAt, tz)} · {a.customer.firstName} {a.customer.lastName}
                    </Link>
                    <span className="block text-sm">
                      {a.service.name} · {a.isRemote ? "Remote" : `${a.address?.city ?? ""}`}
                      {best && ` · Nearest other jobs: ${day.technicians.find((t) => t.id === best.id)?.displayName} (about ${best.d.toFixed(1)} mi straight-line)`}
                    </span>
                  </div>
                  <form action={dispatchAssignAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="date" value={date} />
                    <label htmlFor={`as-${a.id}`} className="sr-only">Assign technician</label>
                    <select id={`as-${a.id}`} name="technicianId" defaultValue={best?.id ?? ""} className="rounded-md border-2 border-line px-2 py-1.5">
                      {day.technicians.map((t) => (
                        <option key={t.id} value={t.id}>{t.displayName}</option>
                      ))}
                    </select>
                    <SubmitButton size="sm">Assign</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_620px]">
        <div className="space-y-6">
          {routes.length === 0 && <EmptyState title="No technicians" />}
          {routes.map((r) => {
            const tech = day.technicians.find((t) => t.id === r.technicianId)!;
            const byId = new Map(day.appointments.map((a) => [a.id, a]));
            const stops = r.result.order.map((id) => byId.get(id)!).filter(Boolean);
            const plan = day.plans.find((p) => p.technicianId === tech.id);
            const addresses = stops.filter((s) => s.address).map((s) => formatAddressForMaps(s.address!));
            const helpDays = day.helpDays.filter((h) => h.technicianId === tech.id);
            const techRemote = remote.filter((a) => a.technicianId === tech.id);
            return (
              <Card key={tech.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-xl">
                    <span className="inline-block h-4 w-4 rounded-full" style={{ background: tech.color }} aria-hidden="true" />
                    {tech.displayName}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {r.isManualOverride && <Badge tone="warn">Manual order</Badge>}
                    {plan?.totalDurationSeconds != null && plan.provider !== "manual" ? (
                      <Badge tone="green">
                        {Math.round(plan.totalDurationSeconds / 60)} min driving · {metersToMiles(plan.totalDistanceMeters)} mi ({plan.provider})
                      </Badge>
                    ) : (
                      <Badge>No drive estimate</Badge>
                    )}
                    {addresses.length > 0 && (
                      <a href={googleDirectionsUrl(addresses, tech.homeBaseLine ?? undefined)} target="_blank" rel="noreferrer" className="font-semibold">
                        Open route in Google Maps
                      </a>
                    )}
                  </div>
                </div>
                {r.missingCoordinates > 0 && provider && <p className="mb-2 text-sm text-warn">{r.missingCoordinates} address(es) not yet located. Use &quot;Locate addresses&quot;.</p>}
                {r.result.warnings.length > 0 && plan?.provider !== "manual" && (
                  <div className="mb-3">
                    <Notice tone="danger" title="Tight connections">
                      {r.result.warnings.join(" ")} Consider reassigning or contacting the customer. Nothing has been moved.
                    </Notice>
                  </div>
                )}
                {helpDays.map((h) => (
                  <p key={h.id} className="mb-2 rounded-md bg-green-light p-2 text-sm text-green-dark">
                    {formatTime(h.startsAt, tz)}–{formatTime(h.endsAt, tz)} Tech Help Day at {h.facility.name}
                  </p>
                ))}
                {stops.length === 0 ? (
                  <p>No in-home visits.</p>
                ) : (
                  <ol className="space-y-2">
                    {stops.map((a, i) => {
                      const legs = plan?.legs as { id: string; arrival: number | null; lateMin: number }[] | null;
                      const leg = legs?.find((l) => l.id === a.id);
                      return (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy font-bold text-white">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <Link href={`/admin/appointments/${a.id}`} className="font-semibold">
                              {formatTime(a.startsAt, tz)}–{formatTime(a.endsAt, tz)} · {a.customer.firstName} {a.customer.lastName}
                            </Link>
                            <span className="block text-sm">
                              {a.address ? formatAddressForMaps(a.address) : "No address"} · {a.service.name}
                              {leg?.arrival && plan?.provider !== "manual" ? ` · est. arrival ${formatTime(new Date(leg.arrival), tz)}` : ""}
                              {leg?.lateMin ? ` · ${leg.lateMin} min late` : ""}
                            </span>
                          </div>
                          <AppointmentStatusBadge status={a.status} />
                          <div className="flex gap-1">
                            {(["up", "down"] as const).map((dir) => (
                              <form key={dir} action={moveStopAction}>
                                <input type="hidden" name="date" value={date} />
                                <input type="hidden" name="technicianId" value={tech.id} />
                                <input type="hidden" name="order" value={r.result.order.join(",")} />
                                <input type="hidden" name="id" value={a.id} />
                                <input type="hidden" name="dir" value={dir} />
                                <button
                                  type="submit"
                                  disabled={(dir === "up" && i === 0) || (dir === "down" && i === stops.length - 1)}
                                  className="rounded border border-line px-2 py-1 text-sm disabled:opacity-30"
                                  aria-label={`Move stop ${i + 1} ${dir}`}
                                >
                                  {dir === "up" ? "Up" : "Down"}
                                </button>
                              </form>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {r.isManualOverride && (
                  <form action={resetOrderAction} className="mt-2">
                    <input type="hidden" name="date" value={date} />
                    <input type="hidden" name="technicianId" value={tech.id} />
                    <SubmitButton size="sm" variant="ghost">Clear manual order</SubmitButton>
                  </form>
                )}
                {techRemote.length > 0 && (
                  <p className="mt-3 text-sm">
                    Remote sessions: {techRemote.map((a) => `${formatTime(a.startsAt, tz)} ${a.customer.lastName}`).join(", ")}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 text-xl">Map</h2>
            {located.length === 0 ? (
              <p>No appointments have map coordinates yet. {provider ? "Use \"Locate addresses\"." : "Coordinates are available once a maps provider is configured."}</p>
            ) : (
              <>
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schematic positions of today's appointments" className="w-full rounded-md border border-line bg-soft">
                  {routes.map((r) => {
                    const tech = day.technicians.find((t) => t.id === r.technicianId)!;
                    const pts = r.result.order
                      .map((id) => day.appointments.find((a) => a.id === id))
                      .filter((a) => a?.address?.lat != null)
                      .map((a) => `${x(a!.address!.lng!)},${y(a!.address!.lat!)}`);
                    return pts.length > 1 ? <polyline key={tech.id} points={pts.join(" ")} fill="none" stroke={tech.color} strokeWidth={2} strokeDasharray="6 4" /> : null;
                  })}
                  {located.map((a) => (
                    <g key={a.id}>
                      <circle cx={x(a.address!.lng!)} cy={y(a.address!.lat!)} r={9} fill={a.technician?.color ?? "#999"} stroke="#fff" strokeWidth={2} />
                      <text x={x(a.address!.lng!) + 12} y={y(a.address!.lat!) + 4} fontSize={12} fill="#071D35">
                        {formatTime(a.startsAt, tz)} {a.customer.lastName}
                      </text>
                    </g>
                  ))}
                </svg>
                <p className="mt-2 text-sm">Schematic view of relative positions (north is up). Lines show visit order, not road paths. Gray markers are unassigned.</p>
              </>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 text-xl">Nearby job groups</h2>
            {groups.length === 0 ? (
              <p>No clusters of nearby jobs on this day.</p>
            ) : (
              <ul className="space-y-2">
                {groups.map((g, i) => (
                  <li key={i}>
                    <span className="font-semibold">Group {i + 1}:</span>{" "}
                    {g
                      .map((item) => day.appointments.find((a) => a.id === item.id)!)
                      .map((a) => `${formatTime(a.startsAt, tz)} ${a.customer.lastName} (${a.address?.city}, ${a.technician?.displayName ?? "unassigned"})`)
                      .join("; ")}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm">Grouped within about 5 miles straight-line, or the same city when coordinates are missing.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

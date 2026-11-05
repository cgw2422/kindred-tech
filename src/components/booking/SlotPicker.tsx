"use client";

import { useEffect, useMemo, useState } from "react";

type DayData = { date: string; slots: string[] };

function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function todayKey(tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p;
}

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return {
    weekday: dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }),
    month: dt.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }),
    day: dt.getUTCDate(),
    long: dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }),
  };
}

/**
 * Accessible appointment time picker. Days are buttons; times are a radio group.
 * Fetches availability from /api/booking/availability.
 */
export function SlotPicker({
  serviceId,
  extensionBlocks = 0,
  timeZone,
  value,
  onChange,
  manageToken,
  appointmentId,
}: {
  serviceId: string;
  extensionBlocks?: number;
  timeZone: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  manageToken?: string;
  appointmentId?: string;
}) {
  const [from, setFrom] = useState(() => todayKey(timeZone));
  const [days, setDays] = useState<DayData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const WINDOW = 14;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ serviceId, from, days: String(WINDOW), ext: String(extensionBlocks) });
    if (manageToken) params.set("manage", manageToken);
    if (appointmentId) params.set("appointment", appointmentId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/booking/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setDays([]);
        } else {
          setError(null);
          setDays(data.days);
          const firstWithSlots = (data.days as DayData[]).find((d) => d.slots.length > 0);
          setSelectedDay((cur) => (cur && (data.days as DayData[]).some((d) => d.date === cur && d.slots.length) ? cur : (firstWithSlots?.date ?? null)));
        }
      })
      .catch(() => !cancelled && setError("We could not load available times. Please try again or call us."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [serviceId, from, extensionBlocks, manageToken, appointmentId]);

  const selectedSlots = useMemo(() => days?.find((d) => d.date === selectedDay)?.slots ?? [], [days, selectedDay]);
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const today = todayKey(timeZone);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-md border-2 border-navy px-4 py-2 font-semibold text-navy disabled:opacity-40"
          onClick={() => setFrom(addDays(from, -WINDOW))}
          disabled={from <= today}
        >
          Earlier dates
        </button>
        <p className="text-sm" aria-live="polite">
          {loading ? "Loading available times..." : ""}
        </p>
        <button type="button" className="rounded-md border-2 border-navy px-4 py-2 font-semibold text-navy" onClick={() => setFrom(addDays(from, WINDOW))}>
          Later dates
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-3 font-semibold text-danger">
          {error}
        </p>
      )}
      <div role="group" aria-label="Choose a date" className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
        {(days ?? []).map((d) => {
          const l = dayLabel(d.date);
          const available = d.slots.length > 0;
          const selected = d.date === selectedDay;
          return (
            <button
              key={d.date}
              type="button"
              disabled={!available}
              aria-pressed={selected}
              aria-label={`${l.long}${available ? `, ${d.slots.length} times available` : ", no times available"}`}
              onClick={() => setSelectedDay(d.date)}
              className={`rounded-md border-2 px-2 py-2 text-center ${
                selected ? "border-green bg-green text-white" : available ? "border-line bg-white text-navy hover:border-navy" : "border-line bg-soft text-gray-500 line-through"
              }`}
            >
              <span className="block text-sm">{l.weekday}</span>
              <span className="block text-lg font-bold">{l.day}</span>
              <span className="block text-sm">{l.month}</span>
            </button>
          );
        })}
      </div>
      {days && days.every((d) => d.slots.length === 0) && !loading && (
        <p className="mt-4 rounded-md bg-warn-light p-3 text-warn">No times are available in these dates. Please try later dates or contact us and we will find a time.</p>
      )}
      {selectedDay && (
        <fieldset className="mt-6">
          <legend className="mb-2 font-heading text-lg text-navy">Available times on {dayLabel(selectedDay).long}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {selectedSlots.map((iso) => {
              const checked = value === iso;
              return (
                <label
                  key={iso}
                  className={`flex cursor-pointer items-center justify-center rounded-md border-2 px-3 py-3 font-semibold has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-green ${checked ? "border-green bg-green-light text-green-dark" : "border-line bg-white text-navy hover:border-navy"}`}
                >
                  <input type="radio" name="slot" value={iso} checked={checked} onChange={() => onChange(iso)} className="sr-only" />
                  {fmtTime(iso)}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

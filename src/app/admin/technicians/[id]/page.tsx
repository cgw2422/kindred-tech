import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Checkbox, Notice, PageHeader, TextInput } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { toDateKey } from "@/lib/time";
import { minutesToTimeInput } from "@/lib/admin/common";
import { WEEKDAY_NAMES, findBlackoutConflicts } from "@/lib/admin/technicians";
import { ActionForm } from "../../_config/ActionForm";
import { BlackoutFields, BlackoutTable } from "../../_config/BlackoutFields";
import { createTimeOffAction, deleteTimeOffAction, saveScheduleAction, updateTechnicianAction } from "../actions";

export const metadata: Metadata = { title: "Technician" };

const EXTRA_ROWS = 2;

export default async function TechnicianPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  await requirePermission("technicians:manage", `/admin/technicians/${id}`);
  const sp = await searchParams;
  const tz = (await getSettings("business")).timeZone;
  const tech = await prisma.technician.findUnique({
    where: { id },
    include: { user: { select: { name: true, email: true, phone: true, isActive: true } }, schedules: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } },
  });
  if (!tech) notFound();
  const now = new Date();
  const blackouts = await prisma.blackout.findMany({ where: { technicianId: id, endsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 50 });
  const conflicts = Object.fromEntries(await Promise.all(blackouts.map(async (b) => [b.id, await findBlackoutConflicts(b.startsAt, b.endsAt, id)] as const)));

  return (
    <div className="max-w-5xl">
      <p className="mb-2">
        <Link href="/admin/technicians">← All technicians</Link>
      </p>
      <PageHeader title={tech.displayName} description={tech.user.email} />
      {sp.created && (
        <div className="mb-6">
          <Notice tone="green" title="Technician added">
            They can sign in using the email link at /login with {tech.user.email}. Next, set their weekly working hours below.
          </Notice>
        </div>
      )}
      {!tech.user.isActive && (
        <div className="mb-6">
          <Notice tone="warn">This person&apos;s login is deactivated (Users &amp; Roles).</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl">Details</h2>
          <ActionForm action={updateTechnicianAction}>
            <input type="hidden" name="id" value={tech.id} />
            <TextInput label="Full name" name="name" required defaultValue={tech.user.name} />
            <TextInput label="Email address" name="email" type="email" required defaultValue={tech.user.email} hint="Used to sign in with an email link." />
            <TextInput label="Phone" name="phone" type="tel" defaultValue={tech.user.phone ?? ""} />
            <TextInput label="Display name" name="displayName" required defaultValue={tech.displayName} />
            <div className="mb-4">
              <label htmlFor="color" className="mb-1 block font-semibold text-navy">
                Calendar color
              </label>
              <input id="color" name="color" type="color" defaultValue={tech.color} className="h-11 w-24 rounded-md border-2 border-line" />
            </div>
            <TextInput label="Home base address" name="homeBaseLine" defaultValue={tech.homeBaseLine ?? ""} />
            <Checkbox name="isActive" label="Active (can be assigned appointments)" defaultChecked={tech.isActive} />
            <SubmitButton>Save details</SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="mb-1 text-xl">Weekly working hours</h2>
          <p className="mb-4 text-body">Add one or more time windows per day (for example 9:00–12:00 and 1:00–5:00). Times use 15-minute steps. Leave a day empty for a day off.</p>
          <ActionForm action={saveScheduleAction}>
            <input type="hidden" name="id" value={tech.id} />
            <div className="space-y-3">
              {WEEKDAY_NAMES.map((day, d) => {
                const wins = tech.schedules.filter((s) => s.dayOfWeek === d);
                const rows = [...wins.map((w) => ({ start: minutesToTimeInput(w.startMinute), end: minutesToTimeInput(w.endMinute) })), ...Array.from({ length: EXTRA_ROWS }, () => ({ start: "", end: "" }))];
                return (
                  <fieldset key={d} className="rounded-md border border-line p-3">
                    <legend className="px-1 font-bold text-navy">{day}</legend>
                    <div className="space-y-2">
                      {rows.map((r, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`w_${d}_${i}_start`}>
                            {day} window {i + 1} start
                          </label>
                          <input id={`w_${d}_${i}_start`} name={`w_${d}_${i}_start`} type="time" step={900} defaultValue={r.start} className="rounded-md border-2 border-line px-2 py-1.5" />
                          <span aria-hidden>to</span>
                          <label className="sr-only" htmlFor={`w_${d}_${i}_end`}>
                            {day} window {i + 1} end
                          </label>
                          <input id={`w_${d}_${i}_end`} name={`w_${d}_${i}_end`} type="time" step={900} defaultValue={r.end} className="rounded-md border-2 border-line px-2 py-1.5" />
                          {i >= wins.length && <span className="text-sm text-body">(optional)</span>}
                        </div>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="mt-4">
              <SubmitButton>Save working hours</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="timeoff">
        <h2 id="timeoff" className="mb-1 text-xl">
          Time off and blocked time
        </h2>
        <p className="mb-4 text-body">
          Business-wide holidays and closures are managed in <Link href="/admin/settings/closures">Settings → Holidays &amp; Closures</Link>. Appointments that overlap new time off are listed so you can reschedule them; they are never moved automatically.
        </p>
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
          <BlackoutTable blackouts={blackouts} conflicts={conflicts} tz={tz} deleteAction={deleteTimeOffAction} extra={{ technicianId: tech.id }} />
          <Card>
            <h3 className="mb-3 text-lg">Add time off</h3>
            <ActionForm action={createTimeOffAction}>
              <input type="hidden" name="technicianId" value={tech.id} />
              <BlackoutFields
                todayKey={toDateKey(now, tz)}
                types={[
                  { value: "TIME_OFF", label: "Time off" },
                  { value: "BLOCKED", label: "Blocked (other)" },
                ]}
              />
            </ActionForm>
          </Card>
        </div>
      </section>
    </div>
  );
}

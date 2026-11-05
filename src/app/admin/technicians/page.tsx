import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Checkbox, EmptyState, Notice, PageHeader, Table, Td, TextInput, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { minutesToLabel } from "@/lib/time";
import { WEEKDAY_NAMES } from "@/lib/admin/technicians";
import { ActionForm } from "../_config/ActionForm";
import { createTechnicianAction } from "./actions";

export const metadata: Metadata = { title: "Technicians" };

export default async function TechniciansPage() {
  await requirePermission("technicians:manage", "/admin/technicians");
  const techs = await prisma.technician.findMany({
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    include: {
      user: { select: { email: true, phone: true, isActive: true, lastLoginAt: true } },
      schedules: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
    },
  });
  return (
    <div>
      <PageHeader title="Technicians" description="The people who visit customers. Set their working hours and time off here." />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div>
          {techs.length === 0 ? (
            <EmptyState title="No technicians yet">Add a technician to start assigning appointments.</EmptyState>
          ) : (
            <Table caption="Technicians">
              <thead>
                <tr>
                  <Th>Technician</Th>
                  <Th>Contact</Th>
                  <Th>Working days</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {techs.map((t) => {
                  const days = [...new Set(t.schedules.map((s) => s.dayOfWeek))];
                  return (
                    <tr key={t.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span aria-hidden className="inline-block h-4 w-4 shrink-0 rounded-full border border-line" style={{ background: t.color }} />
                          <Link href={`/admin/technicians/${t.id}`} className="font-semibold">
                            {t.displayName}
                          </Link>
                        </div>
                        {t.homeBaseLine && <div className="text-sm text-body">Home base: {t.homeBaseLine}</div>}
                      </Td>
                      <Td className="text-sm">
                        <div>{t.user.email}</div>
                        <div>{t.user.phone ?? ""}</div>
                      </Td>
                      <Td className="text-sm">
                        {days.length === 0 ? (
                          <span className="text-danger">No hours set</span>
                        ) : (
                          days.map((d) => (
                            <div key={d}>
                              {WEEKDAY_NAMES[d].slice(0, 3)}:{" "}
                              {t.schedules
                                .filter((s) => s.dayOfWeek === d)
                                .map((s) => `${minutesToLabel(s.startMinute)}–${minutesToLabel(s.endMinute)}`)
                                .join(", ")}
                            </div>
                          ))
                        )}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={t.isActive ? "green" : "neutral"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                          {!t.user.isActive && <Badge tone="danger">Login disabled</Badge>}
                          {!t.user.lastLoginAt && <Badge tone="warn">Never signed in</Badge>}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        <Card>
          <h2 className="mb-3 text-xl">Add a technician</h2>
          <div className="mb-4">
            <Notice tone="navy">No password is needed. They can sign in using the email link at /login with the email address below.</Notice>
          </div>
          <ActionForm action={createTechnicianAction}>
            <TextInput label="Full name" name="name" required maxLength={120} autoComplete="off" />
            <TextInput label="Email address" name="email" type="email" required autoComplete="off" />
            <TextInput label="Phone" name="phone" type="tel" autoComplete="off" />
            <TextInput label="Display name" name="displayName" required maxLength={80} hint="What customers see, e.g. Sam R." />
            <div className="mb-4">
              <label htmlFor="color" className="mb-1 block font-semibold text-navy">
                Calendar color
              </label>
              <input id="color" name="color" type="color" defaultValue="#10375B" className="h-11 w-24 rounded-md border-2 border-line" />
            </div>
            <TextInput label="Home base address" name="homeBaseLine" hint="Starting point for route planning." />
            <Checkbox name="isActive" label="Active (can be assigned appointments)" defaultChecked />
            <SubmitButton>Add technician</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}

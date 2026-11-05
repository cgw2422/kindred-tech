import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, EmptyState, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { humanize } from "@/components/status";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { SERVICES_NAV, SubNav } from "../_config/nav";

export const metadata: Metadata = { title: "Services & Pricing" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("services:manage", "/admin/services");
  const sp = await searchParams;
  const [categories, services] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { appointments: true } } } }),
  ]);
  const groups = [
    ...categories.map((c) => ({ key: c.id, name: c.name, services: services.filter((s) => s.categoryId === c.id) })),
    { key: "none", name: "Uncategorized", services: services.filter((s) => !s.categoryId) },
  ].filter((g) => g.services.length > 0);

  return (
    <div>
      <PageHeader title="Services & Pricing" description="Services customers can book, their prices and booking rules." actions={<ButtonLink href="/admin/services/new">Add a service</ButtonLink>} />
      <SubNav items={SERVICES_NAV} current="/admin/services" label="Services sections" />
      {sp.deleted && (
        <div className="mb-4">
          <Notice tone="green">The service was deleted.</Notice>
        </div>
      )}
      {groups.length === 0 && <EmptyState title="No services yet">Add your first service to start taking bookings.</EmptyState>}
      {groups.map((g) => (
        <section key={g.key} className="mb-8" aria-labelledby={`cat-${g.key}`}>
          <h2 id={`cat-${g.key}`} className="mb-3 text-xl">
            {g.name}
          </h2>
          <Table caption={`${g.name} services`}>
            <thead>
              <tr>
                <Th>Service</Th>
                <Th>Price</Th>
                <Th>Duration</Th>
                <Th>Pricing</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {g.services.map((s) => (
                <tr key={s.id} className={s.isActive ? "" : "bg-soft/60"}>
                  <Td>
                    <Link href={`/admin/services/${s.id}`} className="font-semibold">
                      {s.name}
                    </Link>
                    <div className="text-sm text-body">/{s.slug}</div>
                  </Td>
                  <Td>
                    {s.pricingType === "CUSTOM_QUOTE" ? "Quote" : formatCents(s.basePriceCents)}
                    {s.extensionMinutes && s.extensionPriceCents != null ? (
                      <div className="text-sm text-body">
                        +{formatCents(s.extensionPriceCents)} / {s.extensionMinutes} min
                      </div>
                    ) : null}
                  </Td>
                  <Td>{s.durationMinutes} min</Td>
                  <Td>{humanize(s.pricingType)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={s.isActive ? "green" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                      {s.isBookableOnline && <Badge tone="navy">Online</Badge>}
                      {s.requiresApproval && <Badge tone="warn">Needs approval</Badge>}
                      {s.isRemote && <Badge>Remote</Badge>}
                    </div>
                  </Td>
                  <Td>
                    <Link href={`/admin/services/${s.id}`}>Edit</Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ))}
    </div>
  );
}

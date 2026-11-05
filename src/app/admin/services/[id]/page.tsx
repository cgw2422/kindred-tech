import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ActionForm } from "../../_config/ActionForm";
import { ServiceForm } from "../ServiceForm";
import { removeServiceAction } from "../actions";

export const metadata: Metadata = { title: "Edit Service" };

export default async function EditServicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  await requirePermission("services:manage", `/admin/services/${id}`);
  const sp = await searchParams;
  const [service, categories] = await Promise.all([
    prisma.service.findUnique({ where: { id }, include: { _count: { select: { appointments: true, invoiceLines: true, bundleItems: true } } } }),
    prisma.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  if (!service) notFound();
  const referenced = service._count.appointments + service._count.invoiceLines + service._count.bundleItems > 0;
  return (
    <div className="max-w-4xl">
      <p className="mb-2">
        <Link href="/admin/services">← All services</Link>
      </p>
      <PageHeader title={service.name} description={`${service._count.appointments} appointment(s) use this service.`} />
      {sp.created && (
        <div className="mb-4">
          <Notice tone="green">Service created.</Notice>
        </div>
      )}
      <Card>
        <ServiceForm service={service} categories={categories} />
      </Card>
      <Card className="mt-6">
        <h2 className="mb-2 text-xl">{referenced ? "Deactivate this service" : "Delete this service"}</h2>
        <p className="mb-4">
          {referenced
            ? "This service is referenced by appointments, invoices or bundles, so it cannot be deleted. Deactivating hides it from booking but keeps history intact."
            : "No appointments use this service yet, so it can be deleted permanently."}
        </p>
        <ActionForm action={removeServiceAction}>
          <input type="hidden" name="id" value={service.id} />
          <SubmitButton variant="danger" confirm={referenced ? "Deactivate this service?" : "Permanently delete this service?"}>
            {referenced ? "Deactivate service" : "Delete service"}
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

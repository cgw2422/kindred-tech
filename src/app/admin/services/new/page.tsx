import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ServiceForm } from "../ServiceForm";

export const metadata: Metadata = { title: "New Service" };

export default async function NewServicePage() {
  await requirePermission("services:manage", "/admin/services/new");
  const categories = await prisma.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <div className="max-w-4xl">
      <p className="mb-2">
        <Link href="/admin/services">← All services</Link>
      </p>
      <PageHeader title="Add a service" />
      <Card>
        <ServiceForm categories={categories} />
      </Card>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { ActionForm } from "../../_config/ActionForm";
import { FacilityFields } from "../_components/FacilityFields";
import { createFacilityAction } from "../actions";

export const metadata: Metadata = { title: "Add community" };

export default async function NewFacilityPage() {
  await requirePermission("facilities:manage", "/admin/facilities/new");
  return (
    <div className="max-w-4xl">
      <p className="mb-2 text-sm">
        <Link href="/admin/facilities">← Partner communities</Link>
      </p>
      <PageHeader title="Add a partner community" description="You can add contacts, agreements and Tech Help Days after saving." />
      <Card>
        <ActionForm action={createFacilityAction}>
          <FacilityFields />
          <SubmitButton pendingText="Saving...">Save community</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

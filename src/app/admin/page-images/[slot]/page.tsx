import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { cropOf } from "@/lib/media/service";
import { getSlotDef } from "@/lib/media/slots";
import { assetTag, variantUrl } from "@/lib/media/urls";
import { PageHeader } from "@/components/ui";
import { SlotEditor } from "./SlotEditor";

export const metadata = { title: "Edit Page Image" };

export default async function SlotPage({ params }: { params: Promise<{ slot: string }> }) {
  await requirePermission("website:manage", "/admin/page-images");
  const { slot } = await params;
  const def = getSlotDef(slot);
  if (!def) notFound();
  const row = await prisma.pageImage.findUnique({ where: { slotKey: def.key }, include: { asset: true } });
  const initial = row
    ? {
        asset: { id: row.asset.id, name: row.asset.name, altText: row.asset.altText, width: row.asset.width, height: row.asset.height, version: row.asset.version, thumb: variantUrl(row.asset.id, assetTag(row.asset.version), 480, "webp") },
        altText: row.altText ?? "",
        crop: cropOf(row),
        focal: { x: row.focalX, y: row.focalY },
        mobileFocal: { x: row.mobileFocalX, y: row.mobileFocalY },
      }
    : null;
  return (
    <div className="max-w-4xl">
      <p className="mb-2">
        <Link href="/admin/page-images">Back to Page Images</Link>
      </p>
      <PageHeader eyebrow={def.page} title={def.label} description={def.description} />
      <SlotEditor
        slot={{ key: def.key, label: def.label, page: def.page, pagePath: def.pagePath, aspect: def.aspect, mobileAspect: def.mobileAspect, aspectLabel: def.aspectLabel, recommended: def.recommended }}
        initial={initial}
      />
    </div>
  );
}

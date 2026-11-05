import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { cropOf, getAssetUsage } from "@/lib/media/service";
import { assetTag, originalTag, variantUrl } from "@/lib/media/urls";
import { Card, DefinitionList, PageHeader } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { formatDateTime } from "@/lib/time";
import { deleteAssetAction } from "../actions";
import { AssetCropForm, AssetDetailsForm, ReplaceImage } from "./AssetEditor";

export const metadata = { title: "Image" };

export default async function MediaAssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("website:manage", "/admin/media");
  const { id } = await params;
  const flash = readFlash(await searchParams);
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) notFound();
  const usage = await getAssetUsage(asset.id);
  const props = {
    id: asset.id,
    name: asset.name,
    altText: asset.altText,
    description: asset.description ?? "",
    source: asset.source ?? "",
    license: asset.license ?? "",
    attribution: asset.attribution ?? "",
    crop: cropOf(asset),
    focal: { x: asset.focalX, y: asset.focalY },
    originalSrc: variantUrl(asset.id, originalTag(asset.version), 1200, "webp"),
  };
  return (
    <div>
      <p className="mb-2">
        <Link href="/admin/media">Back to Media Library</Link>
      </p>
      <PageHeader title={asset.name} description={`${asset.width} × ${asset.height} pixels · ${(asset.sizeBytes / 1024).toFixed(0)} KB · version ${asset.version}`} />
      <Flash flash={flash} />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-xl">Preview</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={variantUrl(asset.id, assetTag(asset.version), 1200, "webp")} alt={asset.altText} className="max-h-[420px] w-auto max-w-full rounded-md border border-line" />
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">Crop and focal point</h2>
            <AssetCropForm asset={props} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-xl">Details</h2>
            <AssetDetailsForm asset={props} />
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">Where this image is used</h2>
            {usage.length === 0 ? (
              <p>Not used anywhere yet.</p>
            ) : (
              <ul className="space-y-2">
                {usage.map((u, i) => (
                  <li key={i}>
                    <Link href={u.href}>{u.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">Replace image</h2>
            <p className="mb-3">Upload a new photo in place of this one. Everywhere it is used updates automatically. Crops reset because the new photo may be different.</p>
            <ReplaceImage assetId={asset.id} />
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">File information</h2>
            <DefinitionList
              items={[
                ["Original file", asset.originalFilename ?? "—"],
                ["Format", asset.mimeType],
                ["Uploaded", formatDateTime(asset.createdAt)],
                ["Last changed", formatDateTime(asset.updatedAt)],
              ]}
            />
            <p className="mt-3">Location (GPS) and other hidden camera information were removed when the photo was uploaded.</p>
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">Delete image</h2>
            {usage.length > 0 ? (
              <p>This image is in use. Remove it from the places listed above before deleting it.</p>
            ) : (
              <form action={deleteAssetAction}>
                <input type="hidden" name="id" value={asset.id} />
                <SubmitButton variant="danger" confirm="Delete this image permanently?">
                  Delete image
                </SubmitButton>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

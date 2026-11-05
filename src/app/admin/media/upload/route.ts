import { NextResponse, type NextRequest } from "next/server";
import { assertPermission, AuthorizationError } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/media/process";
import { createAssetFromUpload, MediaValidationError, replaceAssetFile } from "@/lib/media/service";
import { StorageNotConfiguredError } from "@/lib/storage";
import { assetTag, variantUrl } from "@/lib/media/urls";

export const dynamic = "force-dynamic";

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(env.appUrl).origin;
  } catch {
    return false;
  }
}

/** Admin-only image upload (multipart/form-data: file, optional replaceAssetId, altText). */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await assertPermission("website:manage");
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: "You do not have permission to upload images." }, { status: 403 });
    throw err;
  }
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) return NextResponse.json({ error: "Images must be 15 MB or smaller." }, { status: 413 });
  if (!(await rateLimit(`media-upload:${user.id}`, 120, 3600))) return NextResponse.json({ error: "Too many uploads. Please wait a few minutes." }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "The upload could not be read." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Please choose an image to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Images must be 15 MB or smaller." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const replaceAssetId = typeof form.get("replaceAssetId") === "string" ? String(form.get("replaceAssetId")) : "";
  const altText = typeof form.get("altText") === "string" ? String(form.get("altText")) : "";
  try {
    const asset = replaceAssetId
      ? await replaceAssetFile({ assetId: replaceAssetId, buffer, filename: file.name, actorUserId: user.id })
      : await createAssetFromUpload({ buffer, filename: file.name, altText, actorUserId: user.id });
    return NextResponse.json({
      asset: { id: asset.id, name: asset.name, altText: asset.altText, width: asset.width, height: asset.height, version: asset.version, thumb: variantUrl(asset.id, assetTag(asset.version), 480, "webp") },
    });
  } catch (err) {
    if (err instanceof MediaValidationError || err instanceof StorageNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[media] upload failed", (err as Error).message);
    return NextResponse.json({ error: "The image could not be saved. Please try again." }, { status: 500 });
  }
}

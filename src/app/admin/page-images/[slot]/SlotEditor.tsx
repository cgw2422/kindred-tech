"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { CropEditor, FocalPointPicker } from "@/components/admin/media/CropEditor";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import type { CropFractions, PickerAsset } from "@/components/admin/media/types";
import type { ActionState } from "@/lib/forms";
import { originalTag, variantUrl } from "@/lib/media/urls";
import { publishSlotAction, removeSlotAction } from "../actions";

type Slot = { key: string; label: string; page: string; pagePath: string; aspect: number; mobileAspect: number; aspectLabel: string; recommended: string };
type Initial = { asset: PickerAsset; altText: string; crop: CropFractions | null; focal: { x: number; y: number }; mobileFocal: { x: number; y: number } } | null;

/** Visual preview of a crop + focal point inside a frame of the given aspect (mirrors object-fit: cover). */
function FramePreview({ src, assetW, assetH, crop, focal, aspect, label, width }: { src: string; assetW: number; assetH: number; crop: CropFractions | null; focal: { x: number; y: number }; aspect: number; label: string; width: string }) {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cA = (c.w * assetW) / (c.h * assetH);
  const frameH = 1 / aspect; // in units of frame width
  let w: number, h: number;
  if (cA > aspect) {
    h = frameH;
    w = h * cA;
  } else {
    w = 1;
    h = 1 / cA;
  }
  const left = (1 - w) * focal.x;
  const top = (frameH - h) * focal.y;
  const fullW = w / c.w;
  const fullH = h / c.h;
  const imgLeft = left - c.x * fullW;
  const imgTop = top - c.y * fullH;
  return (
    <figure style={{ width }}>
      <div className="relative w-full overflow-hidden rounded-md border border-line bg-green-light" style={{ aspectRatio: String(aspect) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="absolute max-w-none"
          style={{ width: `${fullW * 100}%`, height: `${(fullH / frameH) * 100}%`, left: `${imgLeft * 100}%`, top: `${(imgTop / frameH) * 100}%` }}
        />
      </div>
      <figcaption className="mt-1 text-sm">{label}</figcaption>
    </figure>
  );
}

export function SlotEditor({ slot, initial }: { slot: Slot; initial: Initial }) {
  const router = useRouter();
  const [asset, setAsset] = useState<PickerAsset | null>(initial?.asset ?? null);
  const [altText, setAltText] = useState(initial?.altText ?? "");
  const [crop, setCrop] = useState<CropFractions | null>(initial?.crop ?? null);
  const [focal, setFocal] = useState(initial?.focal ?? { x: 0.5, y: 0.5 });
  const [mobileFocal, setMobileFocal] = useState(initial?.mobileFocal ?? { x: 0.5, y: 0.5 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  const [cropKey, setCropKey] = useState(0);
  const src = asset ? variantUrl(asset.id, originalTag(asset.version), 1200, "webp") : "";
  const effectiveAlt = altText.trim() || asset?.altText || "";

  return (
    <div className="space-y-6">
      {result && <FormMessage state={result} />}
      <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="choose-title">
        <h2 id="choose-title" className="text-xl">
          1. Choose a photograph
        </h2>
        <p className="mt-1">
          Recommended: {slot.recommended}, {slot.aspectLabel}.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {asset && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.thumb} alt="" className="h-24 w-auto rounded-md border border-line" />
          )}
          <button type="button" className={buttonClass(asset ? "outline" : "primary", "md")} onClick={() => setPickerOpen(true)}>
            {asset ? "Choose a different photo" : "Choose or upload a photo"}
          </button>
          {asset && <span className="font-semibold text-navy">{asset.name}</span>}
        </div>
        <MediaPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(a) => {
            setAsset(a);
            setCrop(null);
            setFocal({ x: 0.5, y: 0.5 });
            setMobileFocal({ x: 0.5, y: 0.5 });
            setCropKey((k) => k + 1);
            setPickerOpen(false);
          }}
        />
      </section>

      {asset && (
        <>
          <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="crop-title">
            <h2 id="crop-title" className="mb-3 text-xl">
              2. Crop and position
            </h2>
            <CropEditor key={`${asset.id}-${cropKey}`} src={src} aspect={slot.aspect} initial={crop} onChange={setCrop} />
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <FocalPointPicker src={src} value={focal} onChange={setFocal} label="Desktop focal point" />
              <FocalPointPicker src={src} value={mobileFocal} onChange={setMobileFocal} label="Mobile focal point" />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="alt-title">
            <h2 id="alt-title" className="text-xl">
              3. Alt text
            </h2>
            <label htmlFor="slot-alt" className="mt-2 block font-semibold text-navy">
              Alt text for this page {asset.altText ? "(optional: overrides the image's alt text)" : ""}
            </label>
            <p id="slot-alt-hint" className="text-sm">
              Describe what the photo shows. Avoid implying the people pictured are Kindred customers or staff unless they are.
            </p>
            <input
              id="slot-alt"
              aria-describedby="slot-alt-hint"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              maxLength={300}
              placeholder={asset.altText || "Describe the photo"}
              className="mt-1 min-h-[44px] w-full rounded-md border-2 border-line px-3"
            />
            {!effectiveAlt && <p className="mt-1 font-semibold text-warn">Please add alt text so screen reader users know what the photo shows.</p>}
          </section>

          <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="preview-title">
            <h2 id="preview-title" className="text-xl">
              4. Preview
            </h2>
            <p className="mb-4">How the photo will appear on the {slot.page} page.</p>
            <div className="flex flex-wrap items-end gap-6">
              <FramePreview src={src} assetW={asset.width} assetH={asset.height} crop={crop} focal={focal} aspect={slot.aspect} label="Desktop" width="min(420px, 100%)" />
              <FramePreview src={src} assetW={asset.width} assetH={asset.height} crop={crop} focal={mobileFocal} aspect={slot.mobileAspect} label="Phone" width="200px" />
            </div>
          </section>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {asset && (
          <button
            type="button"
            disabled={pending || !effectiveAlt}
            className={buttonClass("primary", "lg")}
            onClick={() =>
              start(async () => {
                const r = await publishSlotAction({ slotKey: slot.key, assetId: asset.id, altText, crop, focal, mobileFocal });
                setResult(r);
                if (r.ok) router.refresh();
              })
            }
          >
            {pending ? "Publishing..." : "Save and publish"}
          </button>
        )}
        {initial && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("outline", "md")}
            onClick={() => {
              if (!window.confirm("Remove this photo and restore the text-only layout?")) return;
              start(async () => {
                const r = await removeSlotAction(slot.key);
                setResult(r);
                if (r.ok) {
                  setAsset(null);
                  router.refresh();
                }
              });
            }}
          >
            Remove photo
          </button>
        )}
        <a href={slot.pagePath} target="_blank" rel="noreferrer" className="font-semibold">
          View the {slot.page} page<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import type { CropFractions } from "./types";

/**
 * Crop editor (react-easy-crop). Reports the crop as fractions of the image.
 * aspect = undefined lets the admin choose a free ratio via presets.
 */
export function CropEditor({
  src,
  aspect,
  initial,
  onChange,
  allowPresets = false,
}: {
  src: string;
  aspect?: number;
  initial?: CropFractions | null;
  onChange: (crop: CropFractions | null) => void;
  allowPresets?: boolean;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState<number | undefined>(aspect ?? 4 / 3);
  const initialPercent = initial ? { x: initial.x * 100, y: initial.y * 100, width: initial.w * 100, height: initial.h * 100 } : undefined;
  const onComplete = useCallback(
    (area: Area) => {
      onChange({ x: area.x / 100, y: area.y / 100, w: area.width / 100, h: area.height / 100 });
    },
    [onChange],
  );
  return (
    <div>
      <div className="relative h-[360px] w-full overflow-hidden rounded-md bg-navy-dark">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={allowPresets ? ratio : aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onComplete}
          initialCroppedAreaPercentages={initialPercent}
          objectFit="contain"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-semibold text-navy">
          Zoom
          <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-40" aria-label="Zoom" />
        </label>
        {allowPresets && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Aspect ratio">
            {[
              ["Landscape 4:3", 4 / 3],
              ["Wide 16:9", 16 / 9],
              ["Square", 1],
              ["Portrait 4:5", 4 / 5],
            ].map(([label, r]) => (
              <button key={label as string} type="button" aria-pressed={ratio === r} onClick={() => setRatio(r as number)} className={`min-h-[40px] rounded-md px-3 text-sm font-semibold ${ratio === r ? "bg-navy text-white" : "border border-line bg-white"}`}>
                {label as string}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => onChange(null)} className="min-h-[40px] text-sm font-semibold text-navy underline">
          Use the full image (no crop)
        </button>
      </div>
      <p className="mt-2 text-sm">Drag the photo to reposition it inside the frame. Use the slider to zoom in.</p>
    </div>
  );
}

/** Click (or use arrow keys) to set the point of the photo that should always stay visible. */
export function FocalPointPicker({ src, value, onChange, label }: { src: string; value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void; label: string }) {
  return (
    <div>
      <p className="mb-1 font-semibold text-navy">{label}</p>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={`${Math.round(value.x * 100)}% from left, ${Math.round(value.y * 100)}% from top`}
        aria-valuenow={Math.round(value.x * 100)}
        onKeyDown={(e) => {
          const step = 0.05;
          const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const d = map[e.key];
          if (d) {
            e.preventDefault();
            onChange({ x: Math.min(1, Math.max(0, value.x + d[0])), y: Math.min(1, Math.max(0, value.y + d[1])) });
          }
        }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onChange({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
        }}
        className="relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-md border-2 border-line"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="block max-h-[260px] w-auto max-w-full select-none" draggable={false} />
        <span aria-hidden="true" className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-green shadow" style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }} />
      </div>
      <p className="mt-1 text-sm">Click the most important part of the photo (for example, faces). Arrow keys also move the marker.</p>
    </div>
  );
}

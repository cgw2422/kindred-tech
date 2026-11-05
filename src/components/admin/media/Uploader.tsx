"use client";

import { useRef, useState } from "react";
import type { PickerAsset } from "./types";

type Item = { name: string; progress: number; status: "uploading" | "done" | "error"; message?: string };

/** Uploads images to /admin/media/upload with progress. Use replaceAssetId to replace an existing image file. */
export function Uploader({
  onUploaded,
  multiple = true,
  replaceAssetId,
  label = "Upload images",
  compact = false,
}: {
  onUploaded?: (asset: PickerAsset) => void;
  multiple?: boolean;
  replaceAssetId?: string;
  label?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  function upload(file: File, index: number) {
    return new Promise<void>((resolve) => {
      const form = new FormData();
      form.append("file", file);
      if (replaceAssetId) form.append("replaceAssetId", replaceAssetId);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/admin/media/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setItems((cur) => cur.map((it, i) => (i === index ? { ...it, progress: Math.round((e.loaded / e.total) * 100) } : it)));
      };
      xhr.onload = () => {
        let data: { asset?: PickerAsset; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status === 200 && data.asset) {
          setItems((cur) => cur.map((it, i) => (i === index ? { ...it, progress: 100, status: "done" } : it)));
          onUploaded?.(data.asset);
        } else {
          setItems((cur) => cur.map((it, i) => (i === index ? { ...it, status: "error", message: data.error ?? "Upload failed." } : it)));
        }
        resolve();
      };
      xhr.onerror = () => {
        setItems((cur) => cur.map((it, i) => (i === index ? { ...it, status: "error", message: "Network error. Please try again." } : it)));
        resolve();
      };
      xhr.send(form);
    });
  }

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, multiple ? 20 : 1);
    const start = items.length;
    setItems((cur) => [...cur, ...list.map((f) => ({ name: f.name, progress: 0, status: "uploading" as const }))]);
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        setItems((cur) => cur.map((it, j) => (j === start + i ? { ...it, status: "error", message: "Only JPG, PNG, and WebP images are accepted." } : it)));
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        setItems((cur) => cur.map((it, j) => (j === start + i ? { ...it, status: "error", message: "Images must be 15 MB or smaller." } : it)));
        continue;
      }
      await upload(f, start + i);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center ${compact ? "p-4" : "p-8"} ${dragging ? "border-green bg-green-light" : "border-line bg-white"}`}
      >
        <p className="font-semibold text-navy">{replaceAssetId ? "Choose a new photo to replace this one" : "Drag photos here, or"}</p>
        <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md bg-navy px-5 font-semibold text-white has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-green">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} className="sr-only" onChange={(e) => void handle(e.target.files)} />
          {label}
        </label>
        <p className="text-sm">JPG, PNG, or WebP, up to 15 MB. Location data and other hidden photo information are removed automatically.</p>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className="rounded-md border border-line bg-white p-3">
              <div className="flex justify-between gap-3">
                <span className="truncate">{it.name}</span>
                <span className={it.status === "error" ? "font-semibold text-danger" : it.status === "done" ? "font-semibold text-green-dark" : ""}>
                  {it.status === "uploading" ? `${it.progress}%` : it.status === "done" ? "Uploaded" : "Failed"}
                </span>
              </div>
              {it.status === "uploading" && (
                <div className="mt-2 h-2 overflow-hidden rounded bg-soft" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${it.name}`}>
                  <div className="h-full bg-green" style={{ width: `${it.progress}%` }} />
                </div>
              )}
              {it.message && <p className="mt-1 text-danger">{it.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

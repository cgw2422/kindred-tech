"use client";

import { useEffect, useRef, useState } from "react";
import type { PickerAsset } from "./types";
import { Uploader } from "./Uploader";

/** Modal dialog to choose an image from the Media Library or upload a new one. */
export function MediaPicker({ open, onClose, onSelect, title = "Choose an image" }: { open: boolean; onClose: () => void; onSelect: (a: PickerAsset) => void; title?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [assets, setAssets] = useState<PickerAsset[] | null>(null);
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/admin/media/api?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setAssets(d.assets ?? []))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, q, refresh]);

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="picker-title" className="m-auto w-[min(960px,95vw)] max-h-[90vh] rounded-lg border border-line p-0 backdrop:bg-navy-dark/60">
      <div className="flex items-center justify-between border-b border-line bg-soft px-5 py-3">
        <h2 id="picker-title" className="text-xl">
          {title}
        </h2>
        <button type="button" onClick={onClose} className="min-h-[44px] rounded-md px-3 font-semibold text-navy underline">
          Close
        </button>
      </div>
      <div className="p-5">
        <div role="tablist" className="mb-4 flex gap-2">
          {(["library", "upload"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-[44px] rounded-md px-4 font-semibold ${tab === t ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}>
              {t === "library" ? "Media Library" : "Upload new"}
            </button>
          ))}
        </div>
        {tab === "upload" ? (
          <Uploader
            multiple={false}
            label="Choose a photo"
            onUploaded={(a) => {
              setRefresh((n) => n + 1);
              onSelect(a);
            }}
          />
        ) : (
          <>
            <label htmlFor="picker-q" className="sr-only">
              Search images
            </label>
            <input id="picker-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or description" className="mb-4 min-h-[44px] w-full rounded-md border-2 border-line px-3" />
            {assets === null ? (
              <p>Loading images...</p>
            ) : assets.length === 0 ? (
              <p>No images found. Use &quot;Upload new&quot; to add one.</p>
            ) : (
              <ul className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                {assets.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onSelect(a)} className="block w-full overflow-hidden rounded-md border-2 border-line bg-white text-left hover:border-navy focus-visible:border-navy">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.thumb} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                      <span className="block truncate px-2 py-1.5 text-sm font-semibold">{a.name}</span>
                      {!a.altText && <span className="block px-2 pb-1.5 text-xs text-warn">No alt text</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

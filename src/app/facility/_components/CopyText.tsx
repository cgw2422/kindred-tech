"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function CopyText({ id, label, text, rows = 8 }: { id: string; label: string; text: string; rows?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-semibold text-navy">
        {label}
      </label>
      <textarea id={id} readOnly rows={rows} value={text} className="block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark" />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          className={buttonClass("secondary", "sm")}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            } catch {
              (document.getElementById(id) as HTMLTextAreaElement | null)?.select();
            }
          }}
        >
          Copy text
        </button>
        <span role="status" className="text-sm font-semibold text-green-dark">
          {copied ? "Copied." : ""}
        </span>
      </div>
    </div>
  );
}

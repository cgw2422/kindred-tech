"use client";

import { buttonClass } from "@/components/ui";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "sm", "no-print")}>
      {label}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CONTRAST_KEY, TEXT_SIZE_KEY, TEXT_SIZE_LABELS, TEXT_SIZE_MAX, TEXT_SIZE_MIN } from "./preferences";

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode): the setting still applies to this page */
  }
}

/** Text size (A- / A / A+) and high-contrast controls. Built in, no third-party overlay. */
export function DisplayControls() {
  const [size, setSize] = useState(0);
  const [high, setHigh] = useState(false);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const d = document.documentElement;
    // Sync with the preference applied by the boot script before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSize(Number(d.getAttribute("data-text-size") ?? "0") || 0);
    setHigh(d.getAttribute("data-contrast") === "high");
  }, []);

  function applySize(next: number) {
    const v = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, next));
    const d = document.documentElement;
    if (v === 0) d.removeAttribute("data-text-size");
    else d.setAttribute("data-text-size", String(v));
    save(TEXT_SIZE_KEY, v === 0 ? null : String(v));
    setSize(v);
    setAnnounce(`Text size: ${TEXT_SIZE_LABELS[String(v)]}`);
  }

  function toggleContrast() {
    const next = !high;
    const d = document.documentElement;
    if (next) d.setAttribute("data-contrast", "high");
    else d.removeAttribute("data-contrast");
    // Remember an explicit choice either way, so it overrides the system setting.
    save(CONTRAST_KEY, next ? "high" : "standard");
    setHigh(next);
    setAnnounce(next ? "High contrast on" : "High contrast off");
  }

  const btn =
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-white/70 px-2.5 font-semibold text-white hover:bg-white/15 aria-pressed:border-white aria-pressed:bg-white aria-pressed:text-navy disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-label="Text size" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-semibold" aria-hidden="true">
          Text size
        </span>
        {/* Accessible names start with the visible text (WCAG 2.5.3) and then explain the action. */}
        <button type="button" className={btn} onClick={() => applySize(size - 1)} disabled={size <= TEXT_SIZE_MIN}>
          A−<span className="sr-only"> smaller text</span>
        </button>
        <button type="button" className={btn} onClick={() => applySize(0)} aria-pressed={size === 0}>
          A<span className="sr-only"> standard text size</span>
        </button>
        <button type="button" className={`${btn} text-lg`} onClick={() => applySize(size + 1)} disabled={size >= TEXT_SIZE_MAX}>
          A+<span className="sr-only"> larger text</span>
        </button>
      </div>
      <button type="button" className={btn} aria-pressed={high} onClick={toggleContrast}>
        <span aria-hidden="true" className="mr-2 inline-block h-4 w-4 rounded-full border-2 border-current" style={{ background: "linear-gradient(90deg, currentColor 50%, transparent 50%)" }} />
        High contrast
      </button>
      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Shows total elapsed work time (computed on the server at render time) and
 * ticks every second while a timer entry is open. Counting from the client's
 * mount time avoids errors from server/device clock differences.
 */
export function LiveTimer({ totalMs, running }: { totalMs: number; running: boolean }) {
  const [extra, setExtra] = useState(0);
  useEffect(() => {
    if (!running) return;
    const mountedAt = Date.now();
    const t = setInterval(() => setExtra(Date.now() - mountedAt), 1000);
    return () => clearInterval(t);
  }, [running, totalMs]);
  const elapsed = totalMs + (running ? extra : 0);
  return (
    <p className="font-heading text-4xl tabular-nums text-navy">
      <span className="sr-only">Total time worked: </span>
      {fmt(elapsed)}
    </p>
  );
}

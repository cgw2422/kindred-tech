"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { buttonClass } from "@/components/ui";
import type { ActionState } from "@/lib/forms";
import { portalCancelAction, portalRescheduleAction } from "../actions";

export function PortalAppointmentControls({ appointmentId, serviceId, timeZone, allowReschedule, extensionBlocks }: { appointmentId: string; serviceId: string; timeZone: string; allowReschedule: boolean; extensionBlocks: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "move" | "cancel">("none");
  const [slot, setSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setMode("none");
        router.refresh();
      }
    });
  return (
    <div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mb-3 rounded-md p-3 font-semibold ${result.ok ? "bg-green-light text-green-dark" : "bg-danger-light text-danger"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {allowReschedule && (
          <button type="button" className={buttonClass("secondary", "sm")} aria-expanded={mode === "move"} onClick={() => setMode(mode === "move" ? "none" : "move")}>
            Reschedule
          </button>
        )}
        <button type="button" className={buttonClass("outline", "sm")} aria-expanded={mode === "cancel"} onClick={() => setMode(mode === "cancel" ? "none" : "cancel")}>
          Cancel
        </button>
      </div>
      {mode === "move" && (
        <div className="mt-4">
          <SlotPicker serviceId={serviceId} timeZone={timeZone} value={slot} onChange={setSlot} extensionBlocks={extensionBlocks} />
          <button type="button" disabled={!slot || pending} className={buttonClass("primary", "md", "mt-4")} onClick={() => slot && run(() => portalRescheduleAction(appointmentId, slot))}>
            {pending ? "Saving..." : "Move my appointment"}
          </button>
          <p className="mt-2 text-sm">Your current time is held until you choose a new one.</p>
        </div>
      )}
      {mode === "cancel" && (
        <div className="mt-4">
          <label htmlFor={`reason-${appointmentId}`} className="mb-1 block font-semibold text-navy">
            Reason (optional)
          </label>
          <textarea id={`reason-${appointmentId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mb-3 block w-full rounded-md border-2 border-line p-2" />
          <button type="button" disabled={pending} className={buttonClass("danger", "md")} onClick={() => run(() => portalCancelAction(appointmentId, reason))}>
            {pending ? "Canceling..." : "Yes, cancel this appointment"}
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { buttonClass } from "@/components/ui";
import { cancelByTokenAction, rescheduleByTokenAction, type ManageResult } from "./actions";

export function ManageControls({
  token,
  serviceId,
  timeZone,
  allowReschedule,
  policy,
  extensionBlocks,
}: {
  token: string;
  serviceId: string;
  timeZone: string;
  allowReschedule: boolean;
  policy: string;
  extensionBlocks: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "reschedule" | "cancel">("none");
  const [slot, setSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ManageResult | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ManageResult>) =>
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
        <p role={result.ok ? "status" : "alert"} className={`mb-4 rounded-md p-3 font-semibold ${result.ok ? "bg-green-light text-green-dark" : "bg-danger-light text-danger"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      <p className="mb-4 text-sm">{policy}</p>
      <div className="flex flex-wrap gap-3">
        {allowReschedule && (
          <button type="button" className={buttonClass("secondary", "md")} onClick={() => setMode("reschedule")} aria-expanded={mode === "reschedule"}>
            Choose a different time
          </button>
        )}
        <button type="button" className={buttonClass("outline", "md")} onClick={() => setMode("cancel")} aria-expanded={mode === "cancel"}>
          Cancel appointment
        </button>
      </div>
      {mode === "reschedule" && (
        <div className="mt-6 rounded-lg border border-line bg-white p-5">
          <h2 className="mb-3 text-xl">Pick a new time</h2>
          <SlotPicker serviceId={serviceId} timeZone={timeZone} value={slot} onChange={setSlot} manageToken={token} extensionBlocks={extensionBlocks} />
          <button type="button" disabled={!slot || pending} onClick={() => slot && run(() => rescheduleByTokenAction(token, slot))} className={buttonClass("primary", "md", "mt-5")}>
            {pending ? "Saving..." : "Move my appointment"}
          </button>
        </div>
      )}
      {mode === "cancel" && (
        <div className="mt-6 rounded-lg border border-line bg-white p-5">
          <h2 className="mb-3 text-xl">Cancel this appointment?</h2>
          <label htmlFor="reason" className="mb-1 block font-semibold text-navy">
            Reason <span className="text-sm font-normal">(optional)</span>
          </label>
          <textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mb-4 block w-full rounded-md border-2 border-line p-3" maxLength={500} />
          <button type="button" disabled={pending} onClick={() => run(() => cancelByTokenAction(token, reason))} className={buttonClass("danger", "md")}>
            {pending ? "Canceling..." : "Yes, cancel my appointment"}
          </button>
        </div>
      )}
    </div>
  );
}

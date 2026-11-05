"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { initialActionState, type ActionState } from "@/lib/forms";

const WIDTH = 600;
const HEIGHT = 220;

/**
 * Customer signature capture. Works with touch, pen and mouse via pointer
 * events. Customers who cannot sign on screen may use their typed name.
 */
export function SignaturePad({
  action,
  appointmentId,
  defaultName,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  appointmentId: string;
  defaultName: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.fillStyle = "#071d35";
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = point(e);
    if (ctx && last.current) {
      ctx.strokeStyle = "#071d35";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setDataUrl(e.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    setDataUrl("");
  }

  return (
    <form action={formAction}>
      <FormMessage state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="signatureDataUrl" value={dataUrl} />
      <p id="sig-help" className="mb-2 text-body">
        Please sign in the box below with your finger, a stylus or the mouse. If signing on screen is difficult, you may use your typed name instead.
      </p>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Signature box. Draw your signature here."
        aria-describedby="sig-help"
        className="block w-full touch-none rounded-md border-2 border-navy bg-white"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-sm text-body" aria-live="polite">
          {dataUrl ? "Signature captured." : "No signature drawn yet."}
        </span>
        <button type="button" onClick={clear} className="min-h-[44px] rounded-md border-2 border-navy px-4 font-semibold text-navy">
          Clear
        </button>
      </div>
      <div className="mt-4">
        <label htmlFor="signedByName" className="mb-1 block font-semibold text-navy">
          Name of person signing <span className="text-danger">*</span>
        </label>
        <input
          id="signedByName"
          name="signedByName"
          required
          maxLength={120}
          defaultValue={defaultName}
          autoComplete="off"
          className="block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base focus:border-navy focus:outline-none"
        />
      </div>
      <div className="mt-3 flex items-start gap-3">
        <input id="typedConfirmed" type="checkbox" name="typedConfirmed" className="mt-1 h-6 w-6 shrink-0 accent-green" />
        <label htmlFor="typedConfirmed" className="text-navy">
          Use the typed name above as the signature (customer prefers not to sign on screen and confirmed this out loud).
        </label>
      </div>
      <p className="mt-3 text-sm text-body">By signing, the customer confirms the work described was authorized and performed.</p>
      <SubmitButton pendingText="Saving signature..." size="lg" className="mt-3 w-full">
        Save signature
      </SubmitButton>
    </form>
  );
}

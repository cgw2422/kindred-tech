"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { initialActionState } from "@/lib/forms";
import { previewTemplateAction, saveTemplateAction } from "../actions";

type Preview = { subject: string; html: string; text: string; missing: string[] };

const inputClass = "block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark focus:border-navy focus:outline-none";

export function TemplateEditor({
  id,
  templateKey,
  initialSubject,
  initialBody,
  initialActive,
  initialPreview,
}: {
  id: string;
  templateKey: string;
  initialSubject: string;
  initialBody: string;
  initialActive: boolean;
  initialPreview: Preview;
}) {
  const [state, action] = useActionState(saveTemplateAction, initialActionState);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [preview, setPreview] = useState<Preview>(initialPreview);
  const [tab, setTab] = useState<"html" | "text">("html");
  const [previewing, startPreview] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  // When the saved template changes on the server (e.g. "Reset to default"), adopt it.
  const [synced, setSynced] = useState({ s: initialSubject, b: initialBody, p: initialPreview });
  if (synced.s !== initialSubject || synced.b !== initialBody) {
    setSynced({ s: initialSubject, b: initialBody, p: initialPreview });
    setSubject(initialSubject);
    setBody(initialBody);
    setPreview(initialPreview);
  }

  function schedulePreview(nextSubject: string, nextBody: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => refresh(nextSubject, nextBody), 700);
  }

  function refresh(s = subject, b = body) {
    const mine = ++seq.current;
    startPreview(async () => {
      const r = await previewTemplateAction(templateKey, s, b);
      if (mine === seq.current) setPreview(r);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form action={action}>
        <FormMessage state={state} />
        <input type="hidden" name="id" value={id} />
        <div className="mb-4">
          <label htmlFor="subject" className="mb-1 block font-semibold text-navy">
            Subject <span className="text-danger">*</span>
          </label>
          <input
            id="subject"
            name="subject"
            value={subject}
            maxLength={200}
            onChange={(e) => {
              setSubject(e.target.value);
              schedulePreview(e.target.value, body);
            }}
            className={inputClass}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="body" className="mb-1 block font-semibold text-navy">
            Body <span className="text-danger">*</span>
          </label>
          <textarea
            id="body"
            name="body"
            value={body}
            rows={20}
            onChange={(e) => {
              setBody(e.target.value);
              schedulePreview(subject, e.target.value);
            }}
            className={`${inputClass} font-mono text-[0.95rem]`}
          />
        </div>
        <div className="mb-4 flex items-start gap-3">
          <input id="isActive" type="checkbox" name="isActive" defaultChecked={initialActive} className="mt-1 h-5 w-5 accent-green" />
          <label htmlFor="isActive">
            <span className="font-semibold text-navy">Active</span>
            <span className="block text-sm text-body">Inactive templates are not sent; the email is recorded as skipped.</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <SubmitButton>Save template</SubmitButton>
          <button type="button" onClick={() => refresh()} className="rounded-md border-2 border-navy px-5 py-2 font-semibold text-navy">
            Refresh preview
          </button>
        </div>
      </form>

      <section aria-labelledby="preview-heading" aria-busy={previewing}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="preview-heading" className="text-xl">
            Preview {previewing && <span className="text-sm font-normal text-body">(updating…)</span>}
          </h2>
          <div role="tablist" aria-label="Preview format" className="flex gap-1">
            {(["html", "text"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}
              >
                {t === "html" ? "Email view" : "Plain text"}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-2 rounded-md border border-line bg-white p-3">
          <span className="font-semibold text-navy">Subject:</span> {preview.subject || <em>(empty)</em>}
        </p>
        {preview.missing.length > 0 && (
          <p className="mb-2 rounded-md border border-warn/30 bg-warn-light p-3 text-sm text-warn">
            These variables have no sample value and will be blank: {preview.missing.map((m) => `{{${m}}}`).join(", ")}
          </p>
        )}
        {tab === "html" ? (
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full rounded-md border border-line bg-white" />
        ) : (
          <pre className="h-[640px] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-white p-4 text-sm">{preview.text}</pre>
        )}
      </section>
    </div>
  );
}

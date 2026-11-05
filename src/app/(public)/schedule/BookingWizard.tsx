"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { buttonClass } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { submitBookingAction } from "./actions";

export type WizardService = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  pricingType: "FIXED" | "STARTING_AT" | "CUSTOM_QUOTE";
  basePriceCents: number;
  durationMinutes: number;
  extensionMinutes: number | null;
  extensionPriceCents: number | null;
  isRemote: boolean;
  addons: { id: string; name: string; priceCents: number }[];
};

type EstimateResponse = {
  estimate: { lines: { kind: string; label: string; amountCents: number }[]; totalCents: number; isStartingPrice: boolean; isCustomQuote: boolean; note?: string };
  inArea: boolean;
  areaName: string | null;
  discountError: string | null;
  durationMinutes: number;
};

const STEPS = ["Service", "Who it is for", "Location", "Details", "Date & time", "Review"] as const;

function priceLabel(s: WizardService) {
  if (s.pricingType === "CUSTOM_QUOTE") return "Custom pricing";
  const p = formatCents(s.basePriceCents);
  return s.pricingType === "STARTING_AT" ? `Starting at ${p}` : p;
}

const inputCls = "block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark focus:border-navy focus:outline-none aria-[invalid=true]:border-danger";

function Input(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  hint?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  maxLength?: number;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={props.id} className="mb-1 block font-semibold text-navy">
        {props.label}
        {props.required ? <span className="text-danger"> *</span> : <span className="ml-1 text-sm font-normal">(optional)</span>}
      </label>
      {props.hint && (
        <p id={`${props.id}-hint`} className="mb-1 text-sm">
          {props.hint}
        </p>
      )}
      <input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={[props.hint ? `${props.id}-hint` : "", props.error ? `${props.id}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={inputCls}
      />
      {props.error && (
        <p id={`${props.id}-error`} className="mt-1 text-sm font-semibold text-danger">
          {props.error}
        </p>
      )}
    </div>
  );
}

export function BookingWizard({
  services,
  initialServiceId,
  cancellationPolicy,
  minNoticeHours,
  timeZone,
}: {
  services: WizardService[];
  initialServiceId?: string;
  cancellationPolicy: string;
  minNoticeHours: number;
  timeZone: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialServiceId ? 1 : 0);
  const [serviceId, setServiceId] = useState<string>(initialServiceId ?? "");
  const [bookedForSelf, setBookedForSelf] = useState(true);
  const [customer, setCustomer] = useState({ firstName: "", lastName: "", email: "", phone: "", contactPreference: "PHONE" });
  const [requester, setRequester] = useState({ name: "", email: "", phone: "", relationship: "", canPay: false, receiveUpdates: true });
  const [address, setAddress] = useState({ line1: "", line2: "", city: "", state: "OH", postalCode: "", accessNotes: "" });
  const [problem, setProblem] = useState("");
  const [extensionBlocks, setExtensionBlocks] = useState(0);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [discountCode, setDiscountCode] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const service = services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Server-side estimate whenever relevant inputs change on the later steps.
  useEffect(() => {
    if (!serviceId || step < 2) return;
    const params = new URLSearchParams({ serviceId, ext: String(extensionBlocks), addons: addonIds.join(","), zip: address.postalCode, code: discountCode });
    const ctrl = new AbortController();
    fetch(`/api/booking/estimate?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => !d.error && setEstimate(d))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [serviceId, extensionBlocks, addonIds, address.postalCode, discountCode, step]);

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0 && !serviceId) e.service = "Please choose a service.";
    if (s === 1) {
      if (!customer.firstName.trim()) e["customer.firstName"] = "Please enter a first name.";
      if (!customer.lastName.trim()) e["customer.lastName"] = "Please enter a last name.";
      if (customer.phone.replace(/\D/g, "").length < 10) e["customer.phone"] = "Please enter a 10-digit phone number.";
      if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) e["customer.email"] = "Please enter a valid email address.";
      if (!bookedForSelf) {
        if (!requester.name.trim()) e["requester.name"] = "Please enter your name.";
        if (!requester.email.trim() && requester.phone.replace(/\D/g, "").length < 10) e["requester.email"] = "Please give us an email or phone number for you.";
        if (requester.email && !/^\S+@\S+\.\S+$/.test(requester.email)) e["requester.email"] = "Please enter a valid email address.";
      }
    }
    if (s === 2 && service && !service.isRemote) {
      if (!address.line1.trim()) e["address.line1"] = "Please enter the street address.";
      if (!address.city.trim()) e["address.city"] = "Please enter the city.";
      if (!/^\d{5}(-\d{4})?$/.test(address.postalCode.trim())) e["address.postalCode"] = "Please enter a 5-digit ZIP code.";
    }
    if (s === 4 && !startsAt) e.startsAt = "Please choose an appointment time.";
    if (s === 5 && !acceptedTerms) e.acceptedTerms = "Please confirm you have read the terms.";
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => document.getElementById("wizard-errors")?.focus());
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    const e = validate(5);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitBookingAction({
        serviceId,
        startsAt,
        extensionBlocks,
        addonIds,
        discountCode,
        bookedForSelf,
        customer,
        requester: bookedForSelf ? undefined : requester,
        address: service?.isRemote ? undefined : address,
        problemDescription: problem,
        leadSource,
        marketingOptIn,
        acceptedTerms,
        website,
      });
      if (result.ok) {
        const params = new URLSearchParams({ ref: result.reference, t: result.manageToken, s: result.status, a: result.inServiceArea ? "1" : "0" });
        router.push(`/schedule/confirmation?${params}`);
      } else {
        setSubmitError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.code === "SLOT_TAKEN" || result.code === "NOTICE") {
          setStartsAt(null);
          setStep(4);
        }
      }
    });
  }

  const errorList = Object.entries(errors);
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Booking progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${i === step ? "bg-navy text-white" : i < step ? "bg-green-light text-green-dark" : "bg-white text-body border border-line"}`}
            >
              <span className="sr-only">Step {i + 1} of {STEPS.length}: </span>
              {label}
              {i < step && <span className="sr-only"> (completed)</span>}
            </li>
          ))}
        </ol>

        <div className="rounded-lg border border-line bg-white p-5 md:p-8">
          <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-2xl focus:outline-none">
            {step === 0 && "What can we help with?"}
            {step === 1 && "Who is this appointment for?"}
            {step === 2 && (service?.isRemote ? "Remote appointment" : "Where should we visit?")}
            {step === 3 && "Tell us about the problem"}
            {step === 4 && "Choose a date and time"}
            {step === 5 && "Review your request"}
          </h2>

          {errorList.length > 0 && (
            <div id="wizard-errors" tabIndex={-1} role="alert" className="mb-5 rounded-md border border-danger/40 bg-danger-light p-4 text-danger">
              <p className="font-bold">Please fix the following:</p>
              <ul className="ml-5 list-disc">
                {errorList.map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {step === 0 && (
            <fieldset>
              <legend className="sr-only">Choose a service</legend>
              <div className="grid gap-3 md:grid-cols-2">
                {services.map((s) => (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer flex-col rounded-lg border-2 p-4 has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-green ${serviceId === s.id ? "border-green bg-green-light" : "border-line hover:border-navy"}`}
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="service"
                        value={s.id}
                        checked={serviceId === s.id}
                        onChange={() => {
                          setServiceId(s.id);
                          setStartsAt(null);
                          setAddonIds([]);
                          setExtensionBlocks(0);
                        }}
                        className="mt-1.5 h-5 w-5 accent-green"
                      />
                      <span>
                        <span className="block font-heading text-lg font-bold text-navy">{s.name}</span>
                        <span className="block font-semibold text-green-dark">
                          {priceLabel(s)}
                          {s.pricingType !== "CUSTOM_QUOTE" && ` · up to ${s.durationMinutes} minutes`}
                          {s.isRemote && " · by phone or screen share"}
                        </span>
                        <span className="mt-1 block">{s.shortDescription}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-4 text-sm">
                Senior living community? See our <Link href="/senior-living">community partnership options</Link>.
              </p>
            </fieldset>
          )}

          {step === 1 && (
            <div>
              <fieldset className="mb-6">
                <legend className="mb-2 font-semibold text-navy">I am booking this appointment</legend>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="for" checked={bookedForSelf} onChange={() => setBookedForSelf(true)} className="h-5 w-5 accent-green" />
                    For myself
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="for" checked={!bookedForSelf} onChange={() => setBookedForSelf(false)} className="h-5 w-5 accent-green" />
                    For someone else (a parent, relative, or friend)
                  </label>
                </div>
              </fieldset>

              {!bookedForSelf && (
                <fieldset className="mb-6 rounded-md border border-line bg-soft p-4">
                  <legend className="px-1 font-heading text-lg text-navy">About you</legend>
                  <div className="grid gap-x-4 md:grid-cols-2">
                    <Input id="requester-name" label="Your name" value={requester.name} onChange={(v) => setRequester({ ...requester, name: v })} error={errors["requester.name"]} required autoComplete="name" />
                    <Input id="requester-relationship" label="Your relationship to them" value={requester.relationship} onChange={(v) => setRequester({ ...requester, relationship: v })} hint="For example: daughter, son, neighbor" />
                    <Input id="requester-email" label="Your email" type="email" value={requester.email} onChange={(v) => setRequester({ ...requester, email: v })} error={errors["requester.email"]} autoComplete="email" inputMode="email" />
                    <Input id="requester-phone" label="Your phone" type="tel" value={requester.phone} onChange={(v) => setRequester({ ...requester, phone: v })} autoComplete="tel" inputMode="tel" />
                  </div>
                  <label className="mb-2 flex items-start gap-3">
                    <input type="checkbox" checked={requester.receiveUpdates} onChange={(e) => setRequester({ ...requester, receiveUpdates: e.target.checked })} className="mt-1 h-5 w-5 accent-green" />
                    <span>Send me appointment updates (confirmation, reminders, and changes)</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={requester.canPay} onChange={(e) => setRequester({ ...requester, canPay: e.target.checked })} className="mt-1 h-5 w-5 accent-green" />
                    <span>
                      I will pay for this service
                      <span className="block text-sm">Paying does not give access to their private details. We will confirm your permissions with them.</span>
                    </span>
                  </label>
                </fieldset>
              )}

              <fieldset>
                <legend className="mb-2 font-heading text-lg text-navy">{bookedForSelf ? "Your information" : "Information for the person we are helping"}</legend>
                <div className="grid gap-x-4 md:grid-cols-2">
                  <Input id="first-name" label="First name" value={customer.firstName} onChange={(v) => setCustomer({ ...customer, firstName: v })} error={errors["customer.firstName"]} required autoComplete={bookedForSelf ? "given-name" : "off"} />
                  <Input id="last-name" label="Last name" value={customer.lastName} onChange={(v) => setCustomer({ ...customer, lastName: v })} error={errors["customer.lastName"]} required autoComplete={bookedForSelf ? "family-name" : "off"} />
                  <Input id="phone" label="Phone number" type="tel" value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} error={errors["customer.phone"]} required autoComplete={bookedForSelf ? "tel" : "off"} inputMode="tel" hint="We call before every visit." />
                  <Input id="email" label="Email" type="email" value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} error={errors["customer.email"]} autoComplete={bookedForSelf ? "email" : "off"} inputMode="email" hint="For your confirmation. Optional." />
                </div>
                <div className="mb-2">
                  <label htmlFor="contact-pref" className="mb-1 block font-semibold text-navy">
                    Best way to reach {bookedForSelf ? "you" : "them"}
                  </label>
                  <select id="contact-pref" value={customer.contactPreference} onChange={(e) => setCustomer({ ...customer, contactPreference: e.target.value })} className={inputCls}>
                    <option value="PHONE">Phone call</option>
                    <option value="EMAIL">Email</option>
                    <option value="TEXT">Text message</option>
                    <option value="MAIL">Mail</option>
                  </select>
                </div>
              </fieldset>
            </div>
          )}

          {step === 2 && service && (
            <div>
              {service.isRemote ? (
                <p className="text-lg">
                  This is a remote appointment. We will call {bookedForSelf ? "you" : customer.firstName || "them"} at the phone number provided at the appointment time. No address is needed.
                </p>
              ) : (
                <fieldset>
                  <legend className="sr-only">Service address</legend>
                  <Input id="line1" label="Street address" value={address.line1} onChange={(v) => setAddress({ ...address, line1: v })} error={errors["address.line1"]} required autoComplete={bookedForSelf ? "address-line1" : "off"} />
                  <Input id="line2" label="Apartment, unit, or building" value={address.line2} onChange={(v) => setAddress({ ...address, line2: v })} autoComplete={bookedForSelf ? "address-line2" : "off"} />
                  <div className="grid gap-x-4 md:grid-cols-[2fr_1fr_1fr]">
                    <Input id="city" label="City" value={address.city} onChange={(v) => setAddress({ ...address, city: v })} error={errors["address.city"]} required autoComplete={bookedForSelf ? "address-level2" : "off"} />
                    <Input id="state" label="State" value={address.state} onChange={(v) => setAddress({ ...address, state: v.toUpperCase().slice(0, 2) })} required maxLength={2} />
                    <Input id="zip" label="ZIP code" value={address.postalCode} onChange={(v) => setAddress({ ...address, postalCode: v })} error={errors["address.postalCode"]} required inputMode="numeric" autoComplete={bookedForSelf ? "postal-code" : "off"} />
                  </div>
                  <Input id="access" label="Parking or entry notes" value={address.accessNotes} onChange={(v) => setAddress({ ...address, accessNotes: v })} hint="For example: use the side door, gate code, or which building." />
                  {estimate && /^\d{5}/.test(address.postalCode) && (
                    <p role="status" className={`rounded-md p-3 ${estimate.inArea ? "bg-green-light text-green-dark" : "bg-warn-light text-warn"}`}>
                      {estimate.inArea
                        ? `Good news: this address is within our ${estimate.areaName ?? ""} service area.`
                        : "This ZIP code is outside our usual service area. You can still send a request and we will let you know whether we can help."}
                    </p>
                  )}
                </fieldset>
              )}
            </div>
          )}

          {step === 3 && service && (
            <div>
              <div className="mb-4">
                <label htmlFor="problem" className="mb-1 block font-semibold text-navy">
                  What would you like help with? <span className="ml-1 text-sm font-normal">(optional)</span>
                </label>
                <p id="problem-hint" className="mb-1 text-sm">
                  A few words is plenty. Please do not include passwords, account numbers, or medical information.
                </p>
                <textarea id="problem" aria-describedby="problem-hint" rows={5} value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={4000} className={inputCls} />
              </div>
              {service.extensionPriceCents ? (
                <div className="mb-4">
                  <label htmlFor="ext" className="mb-1 block font-semibold text-navy">
                    Need more time?
                  </label>
                  <select id="ext" value={extensionBlocks} onChange={(e) => { setExtensionBlocks(Number(e.target.value)); setStartsAt(null); }} className={inputCls}>
                    <option value={0}>No extra time (up to {service.durationMinutes} minutes)</option>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        Add {n * (service.extensionMinutes ?? 30)} minutes (+{formatCents(n * service.extensionPriceCents!)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {service.addons.length > 0 && (
                <fieldset className="mb-4">
                  <legend className="mb-2 font-semibold text-navy">Optional add-ons</legend>
                  {service.addons.map((a) => (
                    <label key={a.id} className="mb-2 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.id)}
                        onChange={(e) => setAddonIds(e.target.checked ? [...addonIds, a.id] : addonIds.filter((x) => x !== a.id))}
                        className="mt-1 h-5 w-5 accent-green"
                      />
                      <span>
                        {a.name} (+{formatCents(a.priceCents)})
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="mb-4">
                <label htmlFor="lead" className="mb-1 block font-semibold text-navy">
                  How did you hear about us? <span className="ml-1 text-sm font-normal">(optional)</span>
                </label>
                <select id="lead" value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className={inputCls}>
                  <option value="">Choose one</option>
                  {["Friend or family", "Senior living community", "Search engine", "Social media", "Newspaper or flyer", "Church or community group", "Other"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <Input id="code" label="Discount code" value={discountCode} onChange={setDiscountCode} error={estimate?.discountError ?? undefined} />
              <div aria-hidden="true" className="hidden">
                <label htmlFor="website">Website</label>
                <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>
          )}

          {step === 4 && service && (
            <div>
              <p className="mb-4">
                Times are shown in Eastern Time. Appointments need at least {minNoticeHours} hours of notice. Need something sooner? Please call us.
              </p>
              <SlotPicker serviceId={service.id} extensionBlocks={extensionBlocks} timeZone={timeZone} value={startsAt} onChange={setStartsAt} />
            </div>
          )}

          {step === 5 && service && (
            <div>
              <dl className="mb-6 grid gap-3 sm:grid-cols-[180px_1fr]">
                <dt className="font-semibold text-navy">Service</dt>
                <dd>{service.name}</dd>
                <dt className="font-semibold text-navy">When</dt>
                <dd>{startsAt ? fmtWhen(startsAt) : "—"}</dd>
                <dt className="font-semibold text-navy">For</dt>
                <dd>
                  {customer.firstName} {customer.lastName}
                  {!bookedForSelf && ` (booked by ${requester.name})`}
                </dd>
                <dt className="font-semibold text-navy">Where</dt>
                <dd>{service.isRemote ? "Remote (we will call)" : `${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city}, ${address.state} ${address.postalCode}`}</dd>
              </dl>
              {submitError && (
                <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger-light p-3 font-semibold text-danger">
                  {submitError}
                </p>
              )}
              <div className="mb-4 rounded-md bg-soft p-4 text-sm">
                <p className="mb-1 font-bold text-navy">Cancellation policy</p>
                <p>{cancellationPolicy}</p>
              </div>
              <label className="mb-3 flex items-start gap-3">
                <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1 h-5 w-5 accent-green" aria-invalid={errors.acceptedTerms ? true : undefined} />
                <span>
                  I have read the <Link href="/terms" target="_blank">Terms of Service</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.
                  {!bookedForSelf && " I have permission to share this person's contact information to arrange their appointment."} <span className="text-danger">*</span>
                </span>
              </label>
              <label className="mb-6 flex items-start gap-3">
                <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="mt-1 h-5 w-5 accent-green" />
                <span>
                  Send occasional tips and news by email (optional). You can unsubscribe at any time.
                </span>
              </label>
              <button type="button" onClick={submit} disabled={pending} className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
                {pending ? "Sending your request..." : "Submit my request"}
              </button>
            </div>
          )}

          <div className="mt-8 flex justify-between gap-3 border-t border-line pt-5">
            {step > 0 ? (
              <button type="button" onClick={back} className={buttonClass("outline", "md")}>
                Back
              </button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 && (
              <button type="button" onClick={next} className={buttonClass("primary", "md")}>
                Continue
              </button>
            )}
          </div>
        </div>
      </div>

      <aside aria-label="Estimate summary" className="h-fit rounded-lg border border-line bg-white p-5 lg:sticky lg:top-6">
        <h2 className="mb-3 text-xl">Your estimate</h2>
        {!service && <p>Choose a service to see pricing.</p>}
        {service && (
          <>
            <p className="font-semibold text-navy">{service.name}</p>
            {startsAt && <p className="mb-2 text-sm">{fmtWhen(startsAt)}</p>}
            {estimate && step >= 2 ? (
              estimate.estimate.isCustomQuote ? (
                <p>{estimate.estimate.note}</p>
              ) : (
                <>
                  <ul className="my-3 space-y-1 text-[0.95rem]">
                    {estimate.estimate.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>{l.label}</span>
                        <span>{formatCents(l.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="flex justify-between border-t border-line pt-2 text-lg font-bold text-navy">
                    <span>Estimated total</span>
                    <span>
                      {estimate.estimate.isStartingPrice ? "From " : ""}
                      {formatCents(estimate.estimate.totalCents)}
                    </span>
                  </p>
                  {estimate.estimate.note && <p className="mt-2 text-sm">{estimate.estimate.note}</p>}
                </>
              )
            ) : (
              <p className="mt-2 text-lg font-bold text-navy">{priceLabel(service)}</p>
            )}
            <p className="mt-3 text-sm">You pay after your visit. Nothing is charged today.</p>
          </>
        )}
      </aside>
    </div>
  );
}

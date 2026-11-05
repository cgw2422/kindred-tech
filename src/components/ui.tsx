import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "bg-green text-white hover:bg-green-dark border border-green",
  secondary: "bg-navy text-white hover:bg-navy-dark border border-navy",
  outline: "bg-white text-navy border-2 border-navy hover:bg-navy-50",
  ghost: "bg-transparent text-navy hover:bg-navy-50 border border-transparent",
  danger: "bg-danger text-white hover:opacity-90 border border-danger",
  light: "bg-white text-navy hover:bg-green-light border border-white",
};
const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm min-h-[36px]",
  md: "px-5 py-2.5 text-base min-h-[44px]",
  lg: "px-7 py-3.5 text-lg min-h-[52px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-md font-semibold no-underline transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${variantClass[variant]} ${sizeClass[size]} ${extra}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <As className={`rounded-lg border border-line bg-white p-5 md:p-6 ${className}`}>{children}</As>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-green">{eyebrow}</p>}
        <h1 className="text-2xl md:text-3xl">{title}</h1>
        {description && <div className="mt-1 text-body">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const toneClass = {
  neutral: "bg-gray-100 text-gray-800 border-gray-300",
  navy: "bg-navy-50 text-navy border-navy-100",
  green: "bg-green-light text-green-dark border-green/30",
  warn: "bg-warn-light text-warn border-warn/30",
  danger: "bg-danger-light text-danger border-danger/30",
};
export type Tone = keyof typeof toneClass;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>;
}

export function Notice({ children, tone = "navy", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-md border p-4 ${toneClass[tone]}`}>
      {title && <p className="mb-1 font-bold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
      <p className="font-heading text-lg text-navy">{title}</p>
      {children && <div className="mt-2 text-body">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const inner = (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-body">{label}</p>
      <p className="mt-1 font-heading text-3xl text-navy">{value}</p>
      {hint && <p className="mt-1 text-sm text-body">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line bg-white p-5 no-underline hover:border-navy">
      {inner}
    </Link>
  ) : (
    <div className="rounded-lg border border-line bg-white p-5">{inner}</div>
  );
}

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full border-collapse text-left text-[0.95rem]">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={`border-b border-line bg-soft px-4 py-3 text-sm font-bold text-navy ${className}`}>{children}</th>;
}
export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-line px-4 py-3 align-top ${className}`}>{children}</td>;
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(140px,max-content)_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-navy">{k}</dt>
          <dd className="break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Form fields (server-renderable; pair with useActionState in client forms)
// ---------------------------------------------------------------------------

const inputClass =
  "block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark placeholder:text-gray-500 focus:border-navy focus:outline-none aria-[invalid=true]:border-danger";

export function Field({ label, name, hint, error, required, children }: { label: string; name: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode }) {
  // `name` here is the element id used for label/hint/error association.
  return (
    <div className="mb-4">
      <label htmlFor={name} className="mb-1 block font-semibold text-navy">
        {label}
        {required && <span className="text-danger"> *</span>}
        {!required && <span className="ml-1 text-sm font-normal text-body">(optional)</span>}
      </label>
      {hint && (
        <p id={`${name}-hint`} className="mb-1 text-sm text-body">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type FieldProps = { label: string; name: string; hint?: ReactNode; error?: string; required?: boolean };

export function TextInput({ label, name, hint, error, required, className = "", id: idProp, ...rest }: FieldProps & Omit<ComponentProps<"input">, "name">) {
  const id = idProp ?? name;
  return (
    <Field label={label} name={id} hint={hint} error={error} required={required}>
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={`${inputClass} ${className}`}
        {...rest}
      />
    </Field>
  );
}

export function TextArea({ label, name, hint, error, required, rows = 4, id: idProp, ...rest }: FieldProps & Omit<ComponentProps<"textarea">, "name">) {
  const id = idProp ?? name;
  return (
    <Field label={label} name={id} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={inputClass}
        {...rest}
      />
    </Field>
  );
}

export function Select({ label, name, hint, error, required, options, placeholder, id: idProp, ...rest }: FieldProps & Omit<ComponentProps<"select">, "name"> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const id = idProp ?? name;
  return (
    <Field label={label} name={id} hint={hint} error={error} required={required}>
      <select
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={inputClass}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({ label, name, hint, defaultChecked, value = "on", ...rest }: { label: ReactNode; name: string; hint?: ReactNode; defaultChecked?: boolean; value?: string } & Omit<ComponentProps<"input">, "name" | "type">) {
  const id = rest.id ?? `${name}-${value}`;
  return (
    <div className="mb-3 flex items-start gap-3">
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-1 h-5 w-5 shrink-0 accent-green" {...rest} />
      <label htmlFor={id} className="cursor-pointer">
        <span className="font-semibold text-navy">{label}</span>
        {hint && <span className="block text-sm text-body">{hint}</span>}
      </label>
    </div>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-3 text-xl">
      {children}
    </h2>
  );
}

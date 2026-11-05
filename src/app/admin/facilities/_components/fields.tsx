import type { ComponentProps, ReactNode } from "react";
import { Field } from "@/components/ui";

/**
 * Field helpers for pages that render the same form several times (one per
 * contact / agreement): the element id is separate from the form field name
 * so labels stay correctly associated.
 */
const inputClass =
  "block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base text-navy-dark placeholder:text-gray-500 focus:border-navy focus:outline-none";

type Common = { id: string; label: string; name: string; hint?: ReactNode; required?: boolean };

export function FInput({ id, label, name, hint, required, ...rest }: Common & Omit<ComponentProps<"input">, "id" | "name">) {
  return (
    <Field label={label} name={id} hint={hint} required={required}>
      <input id={id} name={name} required={required} aria-describedby={hint ? `${id}-hint` : undefined} className={inputClass} {...rest} />
    </Field>
  );
}

export function FSelect({ id, label, name, hint, required, options, placeholder, ...rest }: Common & Omit<ComponentProps<"select">, "id" | "name"> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Field label={label} name={id} hint={hint} required={required}>
      <select id={id} name={name} required={required} aria-describedby={hint ? `${id}-hint` : undefined} className={inputClass} {...rest}>
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

export function FTextArea({ id, label, name, hint, required, rows = 4, ...rest }: Common & Omit<ComponentProps<"textarea">, "id" | "name">) {
  return (
    <Field label={label} name={id} hint={hint} required={required}>
      <textarea id={id} name={name} rows={rows} required={required} aria-describedby={hint ? `${id}-hint` : undefined} className={inputClass} {...rest} />
    </Field>
  );
}

export function FCheckbox({ id, label, name, defaultChecked, hint }: { id: string; label: ReactNode; name: string; defaultChecked?: boolean; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-5 w-5 shrink-0 accent-green" />
      <label htmlFor={id} className="cursor-pointer">
        <span className="font-semibold text-navy">{label}</span>
        {hint && <span className="block text-sm text-body">{hint}</span>}
      </label>
    </div>
  );
}

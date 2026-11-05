"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonClass } from "./ui";
import type { ActionState } from "@/lib/forms";

export function SubmitButton({
  children,
  pendingText = "Saving...",
  variant = "primary",
  size = "md",
  className = "",
  name,
  value,
  confirm,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "light";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState | undefined | null }) {
  if (!state) return null;
  if (state.ok && state.message) {
    return (
      <div role="status" className="mb-4 rounded-md border border-green/40 bg-green-light p-3 font-semibold text-green-dark">
        {state.message}
      </div>
    );
  }
  if (!state.ok && state.error) {
    return (
      <div role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger-light p-3 font-semibold text-danger">
        {state.error}
      </div>
    );
  }
  return null;
}

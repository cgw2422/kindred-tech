import { buttonClass } from "@/components/ui";

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * "Call Kindred" button. Renders nothing when no phone number is configured,
 * so there is never a non-working contact button.
 */
export function CallButton({
  phone,
  variant = "outline",
  size = "lg",
  showNumber = true,
  className = "",
}: {
  phone?: string | null;
  variant?: "primary" | "secondary" | "outline" | "light";
  size?: "md" | "lg";
  showNumber?: boolean;
  className?: string;
}) {
  if (!phone?.trim()) return null;
  return (
    <a href={telHref(phone)} className={buttonClass(variant, size, `whitespace-nowrap ${className}`)} aria-label={`Call Kindred at ${phone}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
        <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
      </svg>
      <span>
        Call Kindred{showNumber && <span className="font-normal">: {phone}</span>}
      </span>
    </a>
  );
}

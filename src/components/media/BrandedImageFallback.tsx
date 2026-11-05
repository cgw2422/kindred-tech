import { LogoMark } from "@/components/brand/Logo";

/** Tasteful placeholder used when an article has no featured image (decorative). */
export function BrandedImageFallback({ label, aspect = 16 / 9, className = "" }: { label?: string | null; aspect?: number; className?: string }) {
  return (
    <div aria-hidden="true" style={{ aspectRatio: String(aspect) }} className={`relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-line bg-green-light ${className}`}>
      <span className="rounded-full bg-white p-3 shadow-sm">
        <LogoMark size={44} />
      </span>
      {label && <span className="px-4 text-center font-heading text-lg font-bold text-navy">{label}</span>}
    </div>
  );
}

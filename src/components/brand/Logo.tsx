/**
 * Kindred Tech Support horizontal logo. The mark is two overlapping rings
 * (navy and green) suggesting two people connecting, with a small joined
 * "hand" arc beneath: personal assistance and connection, kept understated.
 */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className} focusable="false">
      <circle cx="18" cy="20" r="11" fill="none" stroke="#10375B" strokeWidth="3.5" />
      <circle cx="30" cy="20" r="11" fill="none" stroke="#477C32" strokeWidth="3.5" />
      <path d="M10 37c4.5 4 23.5 4 28 0" fill="none" stroke="#10375B" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  const main = inverted ? "text-white" : "text-navy";
  const sub = inverted ? "text-green-light" : "text-green";
  return (
    <span className="inline-flex items-center gap-3">
      {inverted ? (
        <span className="inline-flex rounded-full bg-white p-1">
          <LogoMark size={compact ? 32 : 40} />
        </span>
      ) : (
        <LogoMark size={compact ? 34 : 44} />
      )}
      <span className="flex flex-col leading-none">
        <span className={`font-heading text-[1.45rem] font-bold tracking-tight ${main}`}>Kindred</span>{" "}
        <span className={`mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] ${sub}`}>Tech Support</span>
      </span>
    </span>
  );
}

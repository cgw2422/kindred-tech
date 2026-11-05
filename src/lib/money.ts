export function formatCents(cents: number | null | undefined, opts: { showFree?: boolean } = {}): string {
  if (cents == null) return "—";
  if (cents === 0 && opts.showFree) return "Free";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  const s = dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return neg ? `-${s}` : s;
}

/** Parses "$1,234.50" / "1234.5" into cents. Returns null for invalid input. */
export function parseDollarsToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function centsToDollarString(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

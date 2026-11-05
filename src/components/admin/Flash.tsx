import type { Flash as FlashT } from "@/lib/admin-helpers";

export function Flash({ flash }: { flash: FlashT }) {
  if (!flash.ok && !flash.error) return null;
  return (
    <div
      role={flash.error ? "alert" : "status"}
      className={`mb-5 rounded-md border p-3 font-semibold ${flash.error ? "border-danger/40 bg-danger-light text-danger" : "border-green/40 bg-green-light text-green-dark"}`}
    >
      {flash.error ?? flash.ok}
    </div>
  );
}

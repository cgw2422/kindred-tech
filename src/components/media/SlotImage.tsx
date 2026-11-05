import { getSlotDef } from "@/lib/media/slots";
import type { RenderableImage } from "@/lib/media/service";
import { ResponsiveImage } from "./ResponsiveImage";

/** Renders an assigned page image slot with the slot's aspect ratios and sizes. */
export function SlotImage({ slotKey, image, className }: { slotKey: string; image: RenderableImage; className?: string }) {
  const def = getSlotDef(slotKey);
  if (!def) return null;
  return <ResponsiveImage image={image} aspect={def.aspect} mobileAspect={def.mobileAspect} sizes={def.sizes} priority={def.priority} className={className} />;
}

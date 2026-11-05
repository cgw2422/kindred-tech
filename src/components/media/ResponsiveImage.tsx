import type { CSSProperties } from "react";
import type { RenderableImage } from "@/lib/media/service";
import { fallbackWidth, srcSet, variantUrl } from "@/lib/media/urls";

/**
 * Responsive, layout-stable image. The frame has a fixed aspect ratio (no layout
 * shift); the image fills it with object-fit: cover, positioned by separate
 * desktop and mobile focal points. Above-the-fold images load with high priority.
 */
export function ResponsiveImage({
  image,
  sizes,
  aspect,
  mobileAspect,
  priority = false,
  className = "",
  rounded = true,
}: {
  image: RenderableImage;
  sizes: string;
  aspect: number;
  mobileAspect?: number;
  priority?: boolean;
  className?: string;
  rounded?: boolean;
}) {
  const style = {
    "--ar-d": String(aspect),
    "--ar-m": String(mobileAspect ?? aspect),
    "--fp-d": `${Math.round(image.focal.x * 100)}% ${Math.round(image.focal.y * 100)}%`,
    "--fp-m": `${Math.round(image.mobileFocal.x * 100)}% ${Math.round(image.mobileFocal.y * 100)}%`,
  } as CSSProperties;
  return (
    <div style={style} className={`relative w-full overflow-hidden bg-green-light [aspect-ratio:var(--ar-m)] md:[aspect-ratio:var(--ar-d)] ${rounded ? "rounded-lg" : ""} ${className}`}>
      <picture>
        <source type="image/webp" srcSet={srcSet(image.assetId, image.tag, image.width, "webp")} sizes={sizes} />
        <img
          src={variantUrl(image.assetId, image.tag, fallbackWidth(image.width), "jpg")}
          srcSet={srcSet(image.assetId, image.tag, image.width, "jpg")}
          sizes={sizes}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover [object-position:var(--fp-m)] md:[object-position:var(--fp-d)]"
        />
      </picture>
    </div>
  );
}

import { serializeJsonLd } from "../_lib/seo";

/** Renders a JSON-LD structured data block. Content is escaped for safe inline use. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

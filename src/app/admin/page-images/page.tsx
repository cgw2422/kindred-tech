import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listSlotsWithAssignments } from "@/lib/media/service";
import { variantUrl } from "@/lib/media/urls";
import { Badge, PageHeader } from "@/components/ui";

export const metadata = { title: "Page Images" };

export default async function PageImagesPage() {
  await requirePermission("website:manage", "/admin/page-images");
  const slots = await listSlotsWithAssignments();
  const pages = [...new Set(slots.map((s) => s.def.page))];
  return (
    <div>
      <PageHeader title="Page Images" description="Choose the photographs shown on the public website. Changes appear on the live site as soon as you publish." />
      <div className="space-y-8">
        {pages.map((page) => (
          <section key={page} aria-labelledby={`pg-${page}`}>
            <h2 id={`pg-${page}`} className="mb-3 text-xl">
              {page}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {slots
                .filter((s) => s.def.page === page)
                .map(({ def, image, row }) => (
                  <li key={def.key} className="flex gap-4 rounded-lg border border-line bg-white p-4">
                    <div className="w-36 shrink-0">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={variantUrl(image.assetId, image.tag, 320, "webp")} alt="" className="w-full rounded-md border border-line object-cover" style={{ aspectRatio: String(def.aspect) }} />
                      ) : (
                        <div className="flex w-full items-center justify-center rounded-md border border-dashed border-line bg-soft text-sm" style={{ aspectRatio: String(def.aspect) }}>
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg">{def.label}</h3>
                      <p className="text-sm">{def.description}</p>
                      <p className="mt-1 text-sm">
                        {def.aspectLabel} · {def.recommended}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-3">
                        {image ? <Badge tone="green">Published</Badge> : <Badge>Text-only layout</Badge>}
                        {row && !image?.alt && <Badge tone="warn">Needs alt text</Badge>}
                        <Link href={`/admin/page-images/${def.key}`} className="font-semibold">
                          {image ? "Change" : "Add photo"}
                          <span className="sr-only">: {def.page} {def.label}</span>
                        </Link>
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

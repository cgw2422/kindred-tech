import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listAssets } from "@/lib/media/service";
import { assetTag, variantUrl } from "@/lib/media/urls";
import { storageStatus } from "@/lib/storage";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { readFlash } from "@/lib/admin-helpers";
import { MediaUploadPanel } from "./MediaUploadPanel";

export const metadata = { title: "Media Library" };

const FILTERS = [
  ["all", "All images"],
  ["used", "In use"],
  ["unused", "Not used"],
  ["no-alt", "Missing alt text"],
] as const;

export default async function MediaLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("website:manage", "/admin/media");
  const sp = await searchParams;
  const flash = readFlash(sp);
  const filter = (FILTERS.find(([k]) => k === sp.filter)?.[0] ?? "all") as "all" | "used" | "unused" | "no-alt";
  const q = (sp.q ?? "").trim();
  const [assets, storage] = await Promise.all([listAssets({ q, filter, take: 120 }), Promise.resolve(storageStatus())]);
  return (
    <div>
      <PageHeader title="Media Library" description="All website photographs in one place. Upload once and reuse on pages and Tech Tips." />
      <Flash flash={flash} />
      {!storage.configured ? (
        <div className="mb-6">
          <Notice tone="warn" title="Image storage is not configured">
            Uploads are disabled until S3-compatible storage is set up (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT). See the README for Railway Buckets setup.
          </Notice>
        </div>
      ) : storage.driver === "local" ? (
        <div className="mb-6">
          <Notice tone="navy" title="Development storage">
            Images are being saved to a local folder because S3 storage is not configured. In production, configure S3-compatible storage.
          </Notice>
        </div>
      ) : null}
      {storage.configured && (
        <div className="mb-8">
          <MediaUploadPanel />
        </div>
      )}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-64 flex-1">
          <label htmlFor="q" className="block font-semibold text-navy">
            Search images
          </label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Name, alt text, or description" className="min-h-[44px] w-full rounded-md border-2 border-line px-3" />
        </div>
        <input type="hidden" name="filter" value={filter} />
        <button className="min-h-[44px] rounded-md bg-navy px-4 font-semibold text-white">Search</button>
      </form>
      <nav aria-label="Filter images" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/media?${new URLSearchParams({ filter: k, ...(q ? { q } : {}) })}`}
            aria-current={k === filter ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-full border px-4 font-semibold no-underline ${k === filter ? "border-navy bg-navy text-white" : "border-line bg-white"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {assets.length === 0 ? (
        <EmptyState title={q || filter !== "all" ? "No images match" : "No images yet"}>{q || filter !== "all" ? "Try another search or filter." : "Upload your first photograph above."}</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/media/${a.id}`} className="block overflow-hidden rounded-lg border border-line bg-white no-underline hover:border-navy">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={variantUrl(a.id, assetTag(a.version), 480, "webp")} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                <span className="block p-3">
                  <span className="block truncate font-semibold text-navy">{a.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {a.usageCount > 0 ? <Badge tone="green">Used {a.usageCount}x</Badge> : <Badge>Unused</Badge>}
                    {!a.altText && <Badge tone="warn">No alt text</Badge>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

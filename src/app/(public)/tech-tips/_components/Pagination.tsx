import Link from "next/link";

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const cls = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 px-3 font-semibold no-underline";
  return (
    <nav aria-label="Pagination" className="mt-10">
      <ul className="flex flex-wrap items-center gap-2">
        {page > 1 && (
          <li>
            <Link href={hrefFor(page - 1)} className={`${cls} border-navy text-navy`} rel="prev">
              Previous
            </Link>
          </li>
        )}
        {nums.map((n, i) => (
          <li key={n} className="flex items-center gap-2">
            {i > 0 && n - nums[i - 1] > 1 && <span aria-hidden="true">…</span>}
            {n === page ? (
              <span aria-current="page" className={`${cls} border-navy bg-navy text-white`}>
                <span className="sr-only">Page </span>
                {n}
              </span>
            ) : (
              <Link href={hrefFor(n)} className={`${cls} border-line bg-white text-navy`}>
                <span className="sr-only">Page </span>
                {n}
              </Link>
            )}
          </li>
        ))}
        {page < pages && (
          <li>
            <Link href={hrefFor(page + 1)} className={`${cls} border-navy text-navy`} rel="next">
              Next
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}

import Link from "next/link";

type Cat = { slug: string; name: string; count: number };

export function SearchForm({ q, label = "Search Tech Tips" }: { q?: string; label?: string }) {
  return (
    <form action="/tech-tips" method="get" role="search" className="flex w-full max-w-xl gap-2">
      <label htmlFor="tips-search" className="sr-only">
        {label}
      </label>
      <input
        id="tips-search"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search, for example: scam text"
        className="min-h-[48px] w-full rounded-md border-2 border-line bg-white px-4 text-base focus:border-navy focus:outline-none"
      />
      <button type="submit" className="min-h-[48px] rounded-md bg-navy px-5 font-semibold text-white">
        Search
      </button>
    </form>
  );
}

export function CategoryNav({ categories, active }: { categories: Cat[]; active?: string }) {
  const visible = categories.filter((c) => c.count > 0 || c.slug === active);
  if (visible.length === 0) return null;
  return (
    <nav aria-label="Tech Tips categories">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link href="/tech-tips" aria-current={!active ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-full border px-4 font-semibold no-underline ${!active ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy"}`}>
            All topics
          </Link>
        </li>
        {visible.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/tech-tips/category/${c.slug}`}
              aria-current={active === c.slug ? "page" : undefined}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-4 font-semibold no-underline ${active === c.slug ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy"}`}
            >
              {c.name}
              <span className="sr-only"> ({c.count} articles)</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

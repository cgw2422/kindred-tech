"use client";

import { useRef, useState, useTransition } from "react";
import { searchCustomersAction } from "../actions";

type Option = { id: string; label: string; detail: string };

/** Search-as-you-type customer selector. Submits the chosen id as `customerId`. */
export function CustomerPicker({ initial }: { initial?: Option | null }) {
  const [selected, setSelected] = useState<Option | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  function onQuery(q: string) {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      const mine = ++seq.current;
      start(async () => {
        const r = await searchCustomersAction(q);
        if (mine === seq.current) {
          setResults(r);
          setSearched(true);
        }
      });
    }, 300);
  }

  return (
    <div className="mb-4">
      <input type="hidden" name="customerId" value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-green bg-green-light p-3">
          <div>
            <p className="font-semibold text-navy">{selected.label}</p>
            {selected.detail && <p className="text-sm">{selected.detail}</p>}
          </div>
          <button type="button" onClick={() => setSelected(null)} className="font-semibold text-navy underline">
            Change customer
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="customer-search" className="mb-1 block font-semibold text-navy">
            Customer <span className="text-danger">*</span>
          </label>
          <p id="customer-search-hint" className="mb-1 text-sm text-body">
            Type at least two letters of the name, phone or email.
          </p>
          <input
            id="customer-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-describedby="customer-search-hint"
            aria-controls="customer-results"
            className="block w-full rounded-md border-2 border-line bg-white px-3 py-2.5 text-base focus:border-navy focus:outline-none"
          />
          <div id="customer-results" aria-live="polite">
            {pending && <p className="mt-2 text-sm text-body">Searching…</p>}
            {!pending && searched && results.length === 0 && <p className="mt-2 text-sm text-body">No customers match “{query}”.</p>}
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-white">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(r);
                        setResults([]);
                        setQuery("");
                      }}
                      className="block w-full px-3 py-2 text-left hover:bg-navy-50"
                    >
                      <span className="font-semibold text-navy">{r.label}</span>
                      {r.detail && <span className="block text-sm text-body">{r.detail}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

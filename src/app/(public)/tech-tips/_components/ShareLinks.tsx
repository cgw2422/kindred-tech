"use client";

import { useState } from "react";

export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const link = "inline-flex min-h-[44px] items-center rounded-md border-2 border-line bg-white px-4 font-semibold text-navy no-underline hover:border-navy";
  return (
    <div>
      <h2 className="text-lg">Share this tip</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        <li>
          <a className={link} href={`mailto:?subject=${enc(title)}&body=${enc(`I thought this might help: ${url}`)}`}>
            Email
          </a>
        </li>
        <li>
          <a className={link} href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`} target="_blank" rel="noopener noreferrer">
            Facebook<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
        <li>
          <button
            type="button"
            className={link}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 4000);
              } catch {
                setCopied(false);
              }
            }}
          >
            Copy link
          </button>
        </li>
        <li>
          <button type="button" className={link} onClick={() => window.print()}>
            Print
          </button>
        </li>
      </ul>
      <p role="status" className="mt-2 min-h-[1.5em]">
        {copied ? "Link copied." : ""}
      </p>
    </div>
  );
}

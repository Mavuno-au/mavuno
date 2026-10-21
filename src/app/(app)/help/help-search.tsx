"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { findHelp, helpHref } from "@/lib/help";

export function HelpSearch() {
  const [query, setQuery] = useState("");
  const term = query.trim();
  const results = findHelp(term, 6);

  return (
    <div className="grid gap-2">
      <label className="flex items-center gap-2 rounded-md border border-rail px-3 focus-within:border-primary">
        <Search className="size-4 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help, like “appeal” or “delete account”"
          aria-label="Search help"
          className="h-11 w-full bg-transparent text-[15px] focus:outline-none"
        />
      </label>
      {term.length >= 2 ? (
        results.length > 0 ? (
          <ul aria-live="polite" className="grid">
            {results.map((article) => (
              <li key={article.slug}>
                <Link href={helpHref(article.slug)} className="block rounded-md px-2 py-2 hover:bg-wash">
                  <span className="block text-[15px] font-medium">{article.title}</span>
                  <span className="block text-sm text-ink-muted">{article.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p aria-live="polite" className="px-2 text-sm text-ink-muted">
            Nothing matches “{term}”. Try another word, or email us.
          </p>
        )
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchItem = { href: string; label: string; section?: string };

// Quick jump to any page in the sidebar. Cmd/Ctrl+K focuses it; Enter opens the highlighted match.
export function SidebarSearch({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 6);
  }, [items, query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(item: SearchItem | undefined) {
    if (!item) return;
    setQuery("");
    inputRef.current?.blur();
    router.push(item.href);
  }

  return (
    <div className="relative">
      <label className="flex h-9 items-center gap-2 rounded-lg border bg-card px-2.5 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(matches[active]);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder="Search…"
          aria-label="Search pages"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground sm:inline">⌘K</kbd>
      </label>
      {query.trim() && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-md animate-in fade-in slide-in-from-top-1 duration-150">
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">No pages match “{query.trim()}”.</p>
          ) : (
            matches.map((item, i) => (
              <button
                key={item.href}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm",
                  i === active ? "bg-muted text-foreground" : "text-foreground/80",
                )}
              >
                {item.label}
                {item.section && <span className="text-xs text-muted-foreground">{item.section}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

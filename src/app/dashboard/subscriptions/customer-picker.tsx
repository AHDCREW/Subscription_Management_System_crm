"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { searchCustomers } from "./actions";
import type { CustomerOption } from "./data";
import { cx } from "@/components/kit";

// Searchable select over approved CUSTOMER accounts. Customers sign up
// themselves, so staff can only pick one here, never create one.
export function CustomerPicker({
  value,
  onChange,
  initialOptions,
  invalid,
}: {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  initialOptions: CustomerOption[];
  invalid?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(initialOptions);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced server search; the latest query wins.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchCustomers(query);
        if (!cancelled) {
          setOptions(results);
          setActive(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(customer: CustomerOption) {
    onChange(customer);
    setOpen(false);
    setQuery("");
  }

  function openSearch() {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name="customerId" value={value?.id ?? ""} />
      {open ? (
        <div className="flex h-9 items-center gap-2 rounded-lg border border-ring bg-background px-2.5 ring-3 ring-ring/50">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-label="Search customers"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search by name, email or company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (options[active]) choose(options[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={openSearch}
            className={cx(
              "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 pr-14 text-left text-sm shadow-xs outline-none transition-[color,box-shadow]",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              invalid && "border-destructive",
            )}
          >
            {value ? (
              <span className="truncate">
                {value.name} <span className="text-muted-foreground">· {value.email}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Choose a customer…</span>
            )}
          </button>
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center gap-1 text-muted-foreground">
            {value && (
              <button
                type="button"
                aria-label="Clear customer"
                className="pointer-events-auto rounded-sm hover:text-foreground"
                onClick={() => onChange(null)}
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
            <ChevronsUpDown className="size-4" aria-hidden />
          </span>
        </>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md animate-in fade-in zoom-in-95 duration-150"
        >
          {options.length === 0 ? (
            <li className="px-2 py-3 text-center text-muted-foreground">
              {loading ? "Searching…" : "No customers found. Customers create their own account by signing up."}
            </li>
          ) : (
            options.map((customer, index) => (
              <li
                key={customer.id}
                role="option"
                aria-selected={value?.id === customer.id}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(customer)}
                onMouseEnter={() => setActive(index)}
                className={cx(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5",
                  index === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{customer.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {customer.email}
                    {customer.company ? ` · ${customer.company}` : ""}
                  </span>
                </span>
                {value?.id === customer.id && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

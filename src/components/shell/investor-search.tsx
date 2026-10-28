'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface InvestorHit {
  userId: number;
  name: string;
  phone: string;
  email: string;
  orderId: number | null;
}

interface SearchResponse {
  hits: InvestorHit[];
}

export function InvestorSearch() {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<InvestorHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const query = term.trim();
  const expanded = open && query.length >= 2;

  useEffect(() => {
    if (query.length < 2) {
      setHits([]);
      setSearched(false);
      setUnavailable(false);
      setHighlighted(-1);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setUnavailable(false);
      try {
        const response = await fetch(`/api/investors/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Investor search failed with status ${response.status}`);
        const result = (await response.json()) as SearchResponse;
        setHits(result.hits);
        setSearched(true);
        setHighlighted(-1);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('[investor-search] request failed:', error);
        setHits([]);
        setSearched(true);
        setUnavailable(true);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const openHit = (hit: InvestorHit) => {
    setOpen(false);
    setTerm('');
    router.push(`/investors/${hit.userId}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    } else if (event.key === 'ArrowDown' && expanded && hits.length > 0) {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % hits.length);
    } else if (event.key === 'ArrowUp' && expanded && hits.length > 0) {
      event.preventDefault();
      setHighlighted((index) => (index <= 0 ? hits.length - 1 : index - 1));
    } else if (event.key === 'Enter' && expanded && highlighted >= 0 && hits[highlighted]) {
      event.preventDefault();
      openHit(hits[highlighted]);
    }
  };

  return (
    <div ref={container} className="relative hidden w-full max-w-md sm:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-label="Search investors"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls="investor-search-results"
        aria-activedescendant={highlighted >= 0 ? `investor-search-option-${highlighted}` : undefined}
        placeholder="Search by name, phone, email or order ID"
        className="w-full rounded-md border border-line bg-canvas px-3 py-1.5 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setHits([]);
          setSearched(false);
          setUnavailable(false);
          setHighlighted(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {expanded && (
        <ul
          id="investor-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-md"
        >
          {unavailable ? (
            <li className="px-3 py-2 text-sm text-muted">Search unavailable</li>
          ) : searched && hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No investors found</li>
          ) : (
            hits.map((hit, index) => (
              <li
                key={hit.userId}
                id={`investor-search-option-${index}`}
                role="option"
                aria-selected={highlighted === index}
                className={`cursor-pointer px-3 py-2 ${highlighted === index ? 'bg-line' : 'hover:bg-line'}`}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openHit(hit)}
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span>{hit.name}</span>
                  {hit.orderId !== null && (
                    <span className="rounded-full bg-line px-2 py-0.5 text-xs text-muted">Order #{hit.orderId}</span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {[hit.phone, hit.email].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ChartCard } from '@/components/charts/chart-card';
import { Heatmap } from '@/components/charts/heatmap';
import { formatInt } from '@/lib/format/money';
import type { BookingActivity, BookingView } from '@/lib/queries/tabs-extra';
import { addMonths, startOfMonth, startOfYear } from '@/lib/filters/dates';

const VIEW_LABELS: Record<BookingView, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

interface Props {
  activity: BookingActivity;
  bookingAnchor: string;
  search: string;
}

function busyLabel(activity: BookingActivity): string {
  const { rows, cols, matrix } = activity;
  const rowTotals = rows.map((_, index) => matrix[index]?.reduce((sum, value) => sum + value, 0) ?? 0);
  const colTotals = cols.map((_, index) => matrix.reduce((sum, row) => sum + (row[index] ?? 0), 0));
  const rowPeak = Math.max(0, ...rowTotals);
  const colPeak = Math.max(0, ...colTotals);
  if (rowPeak === 0 && colPeak === 0) return 'none';
  return rowPeak >= colPeak ? rows[rowTotals.indexOf(rowPeak)] ?? 'none' : cols[colTotals.indexOf(colPeak)] ?? 'none';
}

function urlFor(search: string, view: BookingView, anchor?: string): string {
  const params = new URLSearchParams(search);
  params.set('bv', view);
  if (anchor) params.set('ba', anchor);
  return `/sales?${params.toString()}`;
}

export function BookingActivityPanel({ activity: initialActivity, bookingAnchor, search }: Props) {
  const [activity, setActivity] = useState(initialActivity);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentSearch, setCurrentSearch] = useState(search);
  const [anchor, setAnchor] = useState(bookingAnchor);

  const loadFromUrl = useCallback(async (url: URL) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/booking-activity${url.search}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Booking activity request failed (${response.status}).`);
      const result: BookingActivity = await response.json();
      setActivity(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Booking activity could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  const navigate = useCallback(
    (href: string) => {
      const url = new URL(href, window.location.origin);
      window.history.pushState(null, '', `${url.pathname}${url.search}`);
      setCurrentSearch(url.search);
      setAnchor(url.searchParams.get('ba') ?? bookingAnchor);
      void loadFromUrl(url);
    },
    [bookingAnchor, loadFromUrl],
  );

  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      setCurrentSearch(url.search);
      setAnchor(url.searchParams.get('ba') ?? bookingAnchor);
      void loadFromUrl(url);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [bookingAnchor, loadFromUrl]);

  const onNavigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  const previousAnchor =
    activity.view === 'month'
      ? addMonths(startOfMonth(anchor), -1)
      : activity.view === 'year'
        ? addMonths(startOfYear(anchor), -12)
        : undefined;
  const nextAnchor =
    activity.view === 'month'
      ? addMonths(startOfMonth(anchor), 1)
      : activity.view === 'year'
        ? addMonths(startOfYear(anchor), 12)
        : undefined;
  const links = new URLSearchParams(currentSearch);
  const busy = busyLabel(activity);

  return (
    <ChartCard
      title="Booking activity"
      subtitle={activity.subtitle}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <nav aria-label="Booking activity view" className="inline-flex rounded-lg border border-line p-0.5">
            {(Object.keys(VIEW_LABELS) as BookingView[]).map((view) => {
              const href = urlFor(links.toString(), view, anchor);
              return (
                <Link
                  key={view}
                  href={href}
                  onClick={(event) => onNavigate(event, href)}
                  aria-current={activity.view === view ? 'page' : undefined}
                  className={`rounded-md px-2 py-1 text-xs ${activity.view === view ? 'bg-emerald-600 text-white' : 'text-muted hover:bg-canvas'}`}
                >
                  {VIEW_LABELS[view]}
                </Link>
              );
            })}
          </nav>
          {(activity.view === 'month' || activity.view === 'year') && previousAnchor && nextAnchor && (
            <div className="flex items-center gap-1">
              <Link
                href={urlFor(links.toString(), activity.view, previousAnchor)}
                onClick={(event) => onNavigate(event, urlFor(links.toString(), activity.view, previousAnchor))}
                aria-label={`Previous ${activity.view}`}
                className="rounded-md p-1 text-muted hover:bg-canvas"
              >
                <ChevronLeft size={16} aria-hidden />
              </Link>
              <span className="min-w-24 text-center text-xs font-medium">{activity.title}</span>
              <Link
                href={urlFor(links.toString(), activity.view, nextAnchor)}
                onClick={(event) => onNavigate(event, urlFor(links.toString(), activity.view, nextAnchor))}
                aria-label={`Next ${activity.view}`}
                className="rounded-md p-1 text-muted hover:bg-canvas"
              >
                <ChevronRight size={16} aria-hidden />
              </Link>
            </div>
          )}
        </div>
      }
    >
      <div aria-busy={loading}>
        <Heatmap rows={activity.rows} cols={activity.cols} matrix={activity.matrix} cellLabels={activity.cellLabels} />
      </div>
      {loading && <p className="mt-2 text-xs text-muted">Updating booking activity…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
      <p className="mt-2 text-xs text-muted">
        {formatInt(activity.total)} bookings. Busiest: {busy}.
      </p>
    </ChartCard>
  );
}

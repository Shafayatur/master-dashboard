/**
 * the source DB stores UTC in `timestamp without time zone`.
 * The business works in Dhaka time (UTC+6, no DST), so everything shown or
 * grouped by day/month must be shifted by +6 hours.
 */
export const DHAKA_OFFSET_HOURS = 6;
const HOUR_MS = 3_600_000;

/** SQL fragment: a stored UTC timestamp column expressed in Dhaka time. Pass a trusted, quoted column reference. */
export const dhakaTs = (col: string): string => `(${col} + interval '${DHAKA_OFFSET_HOURS} hours')`;

/** SQL fragment: the Dhaka calendar date of a stored UTC timestamp column. */
export const dhakaDate = (col: string): string => `${dhakaTs(col)}::date`;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC instant at which the given Dhaka calendar day (YYYY-MM-DD) starts. */
export function dhakaDayStartUtc(ymd: string): Date {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Invalid date "${ymd}", expected YYYY-MM-DD`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return new Date(Date.UTC(y, mo - 1, d) - DHAKA_OFFSET_HOURS * HOUR_MS);
}

/**
 * Converts an inclusive Dhaka date range to a half-open UTC range [start, endExclusive)
 * for use as `col >= $1 AND col < $2` (index-friendly: the column is not wrapped in a function).
 */
export function dhakaRangeToUtc(fromYmd: string, toYmd: string): { start: Date; endExclusive: Date } {
  const start = dhakaDayStartUtc(fromYmd);
  const endExclusive = new Date(dhakaDayStartUtc(toYmd).getTime() + 24 * HOUR_MS);
  if (endExclusive <= start) throw new Error('Range end is before start');
  return { start, endExclusive };
}

/** Today's date in Dhaka as YYYY-MM-DD. */
export function todayDhaka(now: Date = new Date()): string {
  return new Date(now.getTime() + DHAKA_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10);
}

/** Formats a UTC instant as Dhaka local "YYYY-MM-DD HH:mm". */
export function formatDhaka(d: Date): string {
  return new Date(d.getTime() + DHAKA_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 16).replace('T', ' ');
}

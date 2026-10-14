import { types } from 'pg';

/**
 * node-postgres parses `timestamp without time zone` in the *process* timezone, so the same row
 * yields different instants on a Dhaka laptop and on Vercel (UTC). The source DB stores UTC, so parse as UTC.
 */
const TIMESTAMP_OID = 1114;
const INT8_OID = 20;

let applied = false;

export function applyPgTypeParsers(): void {
  if (applied) return;
  types.setTypeParser(TIMESTAMP_OID, (v) => new Date(`${v.replace(' ', 'T')}Z`));
  // COUNT(*) etc. return bigint; our counts are far below 2^53
  types.setTypeParser(INT8_OID, (v) => Number(v));
  applied = true;
}

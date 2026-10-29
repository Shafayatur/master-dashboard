/** Per-investor status and latest relevant maturity; expects an `ord` CTE. */
export function perInvestorCte(nowTs: string): string {
  return `per AS (
  SELECT u.id AS user_id,
    BOOL_OR(ord.status = 'invested' AND ord.maturity >= ${nowTs}) AS has_active,
    MAX(ord.maturity) FILTER (WHERE ord.status = 'closed' OR ord.maturity < ${nowTs}) AS last_maturity
  FROM "user" u LEFT JOIN ord ON ord."userId" = u.id
  WHERE u."deletedAt" IS NULL AND u."userType"::text = 'investor'
  GROUP BY u.id
)`;
}

/** Segment expression for the `per` CTE. Threshold arguments are SQL expressions. */
export function segmentCase(nowTs: string, recent: string, cooling: string): string {
  return `CASE
    WHEN per.has_active THEN 'active'
    WHEN per.last_maturity IS NULL THEN 'prospect'
    WHEN per.last_maturity >= ${nowTs} - (${recent} * interval '1 day') THEN 'recently_active'
    WHEN per.last_maturity >= ${nowTs} - (${cooling} * interval '1 day') THEN 'cooling'
    ELSE 'inactive'
  END`;
}

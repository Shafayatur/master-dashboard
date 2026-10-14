/* SQL for the data sanity report (scripts/sanity-check.ts). Aggregates only. */
export interface Check {
  title: string;
  why: string;
  sql: string;
}

const A = `d."deletedAt" IS NULL`;

export const SANITY_CHECKS: Check[] = [
  {
    title: '1. Server',
    why: 'Confirms connection and the server timezone setting (we assume stored timestamps are UTC).',
    sql: `SELECT current_database() AS db, version() AS version, now() AS server_now, current_setting('TimeZone') AS server_tz`,
  },
  {
    title: '2. Row counts (live vs soft-deleted)',
    why: 'Size of each core table and how many rows are soft-deleted.',
    sql: `
      SELECT 'user' AS tbl, COUNT(*) FILTER (WHERE "deletedAt" IS NULL) AS live, COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) AS soft_deleted FROM "user"
      UNION ALL SELECT 'order', COUNT(*) FILTER (WHERE "deletedAt" IS NULL), COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) FROM "order"
      UNION ALL SELECT 'deposits', COUNT(*) FILTER (WHERE "deletedAt" IS NULL), COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) FROM deposits
      UNION ALL SELECT 'returns', COUNT(*) FILTER (WHERE "deletedAt" IS NULL), COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) FROM returns
      UNION ALL SELECT 'return_schedules', COUNT(*) FILTER (WHERE "deletedAt" IS NULL), COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) FROM return_schedules
      UNION ALL SELECT 'products', COUNT(*) FILTER (WHERE "deletedAt" IS NULL), COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) FROM products
      UNION ALL SELECT 'categories', COUNT(*) FILTER (WHERE "deletedAt" IS NULL), COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) FROM categories`,
  },
  {
    title: '3. Relationship integrity (no FK constraints exist)',
    why: 'Rows whose parent is missing or soft-deleted would silently skew joins and totals.',
    sql: `
      SELECT 'order.userId -> user' AS relation, COUNT(*) FILTER (WHERE p.id IS NULL) AS missing_parent, COUNT(*) FILTER (WHERE p."deletedAt" IS NOT NULL) AS parent_soft_deleted FROM "order" c LEFT JOIN "user" p ON p.id = c."userId" WHERE c."deletedAt" IS NULL
      UNION ALL SELECT 'order.productId -> products', COUNT(*) FILTER (WHERE p.id IS NULL), COUNT(*) FILTER (WHERE p."deletedAt" IS NOT NULL) FROM "order" c LEFT JOIN products p ON p.id = c."productId" WHERE c."deletedAt" IS NULL
      UNION ALL SELECT 'deposits.orderId -> order', COUNT(*) FILTER (WHERE p.id IS NULL), COUNT(*) FILTER (WHERE p."deletedAt" IS NOT NULL) FROM deposits c LEFT JOIN "order" p ON p.id = c."orderId" WHERE c."deletedAt" IS NULL
      UNION ALL SELECT 'returns.orderId -> order', COUNT(*) FILTER (WHERE p.id IS NULL), COUNT(*) FILTER (WHERE p."deletedAt" IS NOT NULL) FROM returns c LEFT JOIN "order" p ON p.id = c."orderId" WHERE c."deletedAt" IS NULL
      UNION ALL SELECT 'return_schedules.orderId -> order', COUNT(*) FILTER (WHERE p.id IS NULL), COUNT(*) FILTER (WHERE p."deletedAt" IS NOT NULL) FROM return_schedules c LEFT JOIN "order" p ON p.id = c."orderId" WHERE c."deletedAt" IS NULL`,
  },
  {
    title: '4. Which dates are trustworthy? (counts per Dhaka month)',
    why: 'A single huge month in one column usually means a data migration stamped everything with one date.',
    sql: `
      WITH s AS (
        SELECT 'user_created' AS src, "createdAt" AS ts FROM "user" WHERE "deletedAt" IS NULL AND "userType" = 'investor'
        UNION ALL SELECT 'order_created', "createdAt" FROM "order" WHERE "deletedAt" IS NULL
        UNION ALL SELECT 'order_investmentDate', "investmentDate" FROM "order" WHERE "deletedAt" IS NULL AND "investmentDate" IS NOT NULL
        UNION ALL SELECT 'deposit_date', "date" FROM deposits WHERE "deletedAt" IS NULL AND "date" IS NOT NULL
        UNION ALL SELECT 'deposit_createdAt', "createdAt" FROM deposits WHERE "deletedAt" IS NULL
        UNION ALL SELECT 'return_date', "date" FROM returns WHERE "deletedAt" IS NULL AND "date" IS NOT NULL
      )
      SELECT to_char(date_trunc('month', ts + interval '6 hours'), 'YYYY-MM') AS month,
        COUNT(*) FILTER (WHERE src = 'user_created') AS user_created,
        COUNT(*) FILTER (WHERE src = 'order_created') AS order_created,
        COUNT(*) FILTER (WHERE src = 'order_investmentDate') AS order_investmentDate,
        COUNT(*) FILTER (WHERE src = 'deposit_date') AS deposit_date,
        COUNT(*) FILTER (WHERE src = 'deposit_createdAt') AS deposit_createdAt,
        COUNT(*) FILTER (WHERE src = 'return_date') AS return_date
      FROM s GROUP BY 1 ORDER BY 1`,
  },
  {
    title: '5. Deposit date columns',
    why: 'Does deposits."date" carry a time part (does +6h matter?), and how do date / depositDate / createdAt differ?',
    sql: `
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "date" IS NULL) AS null_date,
        COUNT(*) FILTER (WHERE "date"::time <> TIME '00:00') AS date_has_time_part,
        COUNT(*) FILTER (WHERE "depositDate" IS NOT NULL) AS has_depositDate,
        COUNT(*) FILTER (WHERE "depositDate"::date <> "date"::date) AS depositDate_differs_from_date,
        COUNT(*) FILTER (WHERE "createdAt"::date <> "date"::date) AS createdAt_differs_from_date,
        MIN("date") AS min_date, MAX("date") AS max_date
      FROM deposits d WHERE ${A}`,
  },
  {
    title: '6. Sales by month: approved deposits by "date" (+6h)',
    why: 'The headline definition. Reconcile these against the the existing IR daily tracker before building charts.',
    sql: `
      SELECT to_char(date_trunc('month', d."date" + interval '6 hours'), 'YYYY-MM') AS month,
        COUNT(*) AS deposits, COUNT(DISTINCT o."userId") AS unique_investors,
        ROUND(SUM(d.amount)::numeric, 0) AS amount_bdt
      FROM deposits d LEFT JOIN "order" o ON o.id = d."orderId"
      WHERE ${A} AND d.status = 'approved' GROUP BY 1 ORDER BY 1`,
  },
  {
    title: '7. Deposit status x payment method',
    why: 'Shows how much money sits in pending/rejected and how much is reinvest/cash/cheque.',
    sql: `
      SELECT d.status::text AS status, d."paymentMethod"::text AS method, COUNT(*) AS n, ROUND(SUM(d.amount)::numeric, 0) AS amount_bdt
      FROM deposits d WHERE ${A} GROUP BY 1, 2 ORDER BY 1, 2`,
  },
  {
    title: '8. Orders vs approved deposits',
    why: 'Do invested/closed orders have an approved deposit, and do amounts match? Cancelled orders with money are the edge case you said to ignore.',
    sql: `
      WITH dep AS (
        SELECT "orderId", COUNT(*) FILTER (WHERE status = 'approved') AS approved_n, SUM(amount) FILTER (WHERE status = 'approved') AS approved_amt
        FROM deposits WHERE "deletedAt" IS NULL GROUP BY 1
      )
      SELECT o.status::text AS order_status, COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE COALESCE(dep.approved_n, 0) = 0) AS no_approved_deposit,
        COUNT(*) FILTER (WHERE dep.approved_n > 1) AS multiple_approved_deposits,
        COUNT(*) FILTER (WHERE dep.approved_amt IS NOT NULL AND ABS(dep.approved_amt - o."totalAmount") > 1) AS amount_mismatch
      FROM "order" o LEFT JOIN dep ON dep."orderId" = o.id
      WHERE o."deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    title: '9. Maturity dates vs order status',
    why: 'Validates the segment logic: "invested" should be mostly not-yet-matured, "closed" mostly matured. Maturity = last return_schedules date, else investmentDate + product duration.',
    sql: `
      WITH sched AS (SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1),
      m AS (
        SELECT o.status::text AS status, (s.last_pay IS NOT NULL) AS from_schedule,
          COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
        FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id
        WHERE o."deletedAt" IS NULL AND o.status IN ('invested', 'closed')
      )
      SELECT status, COUNT(*) AS orders, COUNT(*) FILTER (WHERE from_schedule) AS maturity_from_schedule,
        COUNT(*) FILTER (WHERE maturity IS NULL) AS no_maturity,
        COUNT(*) FILTER (WHERE maturity < now()) AS already_matured, COUNT(*) FILTER (WHERE maturity >= now()) AS not_yet_matured
      FROM m GROUP BY 1`,
  },
  {
    title: '10. Registration to first investment',
    why: 'Baseline conversion: share of investors with an approved deposit and the median days it took.',
    sql: `
      WITH first_dep AS (
        SELECT o."userId", MIN(d."date") AS first_dep
        FROM deposits d JOIN "order" o ON o.id = d."orderId" WHERE ${A} AND d.status = 'approved' GROUP BY 1
      )
      SELECT COUNT(*) AS investors, COUNT(f."userId") AS ever_invested,
        ROUND(100.0 * COUNT(f."userId") / NULLIF(COUNT(*), 0), 1) AS pct_converted,
        ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (f.first_dep - u."createdAt")) / 86400))::numeric, 1) AS median_days_to_first_deposit,
        COUNT(*) FILTER (WHERE f.first_dep < u."createdAt") AS first_deposit_before_registration
      FROM "user" u LEFT JOIN first_dep f ON f."userId" = u.id
      WHERE u."deletedAt" IS NULL AND u."userType" = 'investor'`,
  },
  {
    title: '11. Payouts',
    why: 'Completed vs initiated payouts and the date range covered; schedule coverage for upcoming payouts.',
    sql: `
      SELECT 'returns:' || status::text AS item, COUNT(*) AS n, ROUND(SUM(amount)::numeric, 0) AS amount_bdt, MIN("date") AS min_date, MAX("date") AS max_date
      FROM returns WHERE "deletedAt" IS NULL GROUP BY status
      UNION ALL
      SELECT 'return_schedules', COUNT(*), ROUND(SUM("totalAmount")::numeric, 0), MIN("paymentDate"), MAX("paymentDate") FROM return_schedules WHERE "deletedAt" IS NULL
      UNION ALL
      SELECT 'orders_with_schedule', COUNT(DISTINCT "orderId"), NULL, NULL, NULL FROM return_schedules WHERE "deletedAt" IS NULL`,
  },
  {
    title: '12. Products',
    why: 'Catalogue size, how many are active/Shariah, and how many have no category.',
    sql: `
      SELECT COUNT(*) AS products, COUNT(*) FILTER (WHERE "isActive") AS active, COUNT(*) FILTER (WHERE "isShariah") AS shariah,
        COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM category_products cp WHERE cp."productsId" = p.id)) AS without_category,
        MIN(price) AS min_price, MAX(price) AS max_price, SUM(stock) AS total_stock
      FROM products p WHERE p."deletedAt" IS NULL`,
  },
  {
    title: '13. Future-dated records',
    why: 'Deposits and payouts dated after today. Shows how many, how far ahead, and how much money, so "this month" figures can be capped correctly. An empty result means none exist.',
    sql: `
      WITH today AS (SELECT (now() AT TIME ZONE 'UTC' + interval '6 hours')::date AS dt),
      x AS (
        SELECT 'deposits' AS tbl, d.status::text AS status, d.amount AS amount, d."date" AS ts,
          ((d."date" + interval '6 hours')::date - (SELECT dt FROM today)) AS days_ahead
        FROM deposits d WHERE d."deletedAt" IS NULL
        UNION ALL
        SELECT 'returns', r.status::text, r.amount, r."date", ((r."date" + interval '6 hours')::date - (SELECT dt FROM today))
        FROM returns r WHERE r."deletedAt" IS NULL
      )
      SELECT tbl, status, days_ahead, COUNT(*) AS n, ROUND(SUM(amount)::numeric, 0) AS amount_bdt, MIN(ts) AS min_ts, MAX(ts) AS max_ts
      FROM x WHERE days_ahead > 0 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
  },
  {
    title: '14. Invested orders past maturity',
    why: 'How far past maturity the still-"invested" orders are, and whether a payout exists for them. Decides whether they are normal payout lag or stale status.',
    sql: `
      WITH sched AS (SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1),
      rp AS (
        SELECT "orderId", bool_or(status = 'initiated') AS has_initiated, bool_or(status = 'completed') AS has_completed
        FROM returns WHERE "deletedAt" IS NULL GROUP BY 1
      ),
      m AS (
        SELECT o.id, o."totalAmount" AS amount, COALESCE(rp.has_initiated, false) AS has_initiated, COALESCE(rp.has_completed, false) AS has_completed,
          COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
        FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id LEFT JOIN rp ON rp."orderId" = o.id
        WHERE o."deletedAt" IS NULL AND o.status = 'invested'
      ),
      od AS (
        SELECT m.*, (floor(EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - maturity)) / 86400))::int AS days_overdue
        FROM m WHERE maturity < (now() AT TIME ZONE 'UTC')
      )
      SELECT CASE WHEN days_overdue <= 7 THEN '0-7 days' WHEN days_overdue <= 30 THEN '8-30 days' WHEN days_overdue <= 90 THEN '31-90 days' ELSE 'over 90 days' END AS overdue_by,
        COUNT(*) AS orders, ROUND(SUM(amount)::numeric, 0) AS invested_bdt,
        COUNT(*) FILTER (WHERE has_initiated) AS with_initiated_payout, COUNT(*) FILTER (WHERE has_completed) AS with_any_completed_payout
      FROM od GROUP BY 1 ORDER BY MIN(days_overdue)`,
  },
  {
    title: '15. Product stock vs units sold',
    why: 'products.stock is understood to be units remaining. If so, closed projects should sit near zero and sold/(sold+left) is the fill rate. Confirms that reading.',
    sql: `
      WITH sold AS (
        SELECT o."productId", SUM(o.quantity) AS units_sold
        FROM "order" o WHERE o."deletedAt" IS NULL AND o.status IN ('invested', 'closed') GROUP BY 1
      )
      SELECT p."isActive" AS is_active, COUNT(*) AS products,
        COUNT(*) FILTER (WHERE COALESCE(p.stock, 0) = 0) AS stock_zero, COUNT(*) FILTER (WHERE p.stock > 0) AS stock_positive, COUNT(*) FILTER (WHERE p.stock < 0) AS stock_negative,
        SUM(p.stock) AS units_left, COALESCE(SUM(s.units_sold), 0) AS units_sold, COUNT(*) FILTER (WHERE s.units_sold IS NULL) AS never_sold,
        ROUND((100.0 * SUM(s.units_sold) / NULLIF(SUM(s.units_sold) + SUM(p.stock), 0))::numeric, 1) AS pct_sold_if_stock_is_remaining
      FROM products p LEFT JOIN sold s ON s."productId" = p.id WHERE p."deletedAt" IS NULL GROUP BY 1 ORDER BY 1 DESC`,
  },
  {
    title: '16. Registration to first investment: distribution',
    why: 'Time buckets and percentiles (negative gaps excluded). Settles the median reported by check 10 and sets the 7/30/90-day conversion windows.',
    sql: `
      WITH first_dep AS (
        SELECT o."userId", MIN(d."date") AS first_dep
        FROM deposits d JOIN "order" o ON o.id = d."orderId" WHERE ${A} AND o."deletedAt" IS NULL AND d.status = 'approved' GROUP BY 1
      ),
      t AS (
        SELECT (f."userId" IS NOT NULL) AS converted, EXTRACT(EPOCH FROM (f.first_dep - u."createdAt")) / 86400 AS days
        FROM "user" u LEFT JOIN first_dep f ON f."userId" = u.id
        WHERE u."deletedAt" IS NULL AND u."userType" = 'investor'
      )
      SELECT COUNT(*) AS investors, COUNT(*) FILTER (WHERE converted) AS converted,
        COUNT(*) FILTER (WHERE converted AND days < 0) AS negative_gap,
        COUNT(*) FILTER (WHERE converted AND days >= 0 AND days < 1) AS same_day,
        COUNT(*) FILTER (WHERE converted AND days >= 1 AND days < 7) AS d1_to_7,
        COUNT(*) FILTER (WHERE converted AND days >= 7 AND days < 30) AS d7_to_30,
        COUNT(*) FILTER (WHERE converted AND days >= 30 AND days < 90) AS d30_to_90,
        COUNT(*) FILTER (WHERE converted AND days >= 90) AS d90_plus,
        ROUND((percentile_cont(0.25) WITHIN GROUP (ORDER BY days) FILTER (WHERE converted AND days >= 0))::numeric, 1) AS p25_days,
        ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY days) FILTER (WHERE converted AND days >= 0))::numeric, 1) AS median_days,
        ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY days) FILTER (WHERE converted AND days >= 0))::numeric, 1) AS p75_days,
        ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY days) FILTER (WHERE converted AND days >= 0))::numeric, 1) AS p90_days
      FROM t`,
  },
];

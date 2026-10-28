import 'server-only';
import type { QueryFn } from './sql-filters';

export type ActiveProject = {
  projectId: number;
  name: string;
  tenureMonths: number;
  returnType: string;
  unitPrice: number;
  unitsLeft: number;
  unitsSold: number;
  fundedPct: number | null;
  isActive: boolean;
  runningOrders: number;
  runningAmount: number;
  runningInvestors: number;
  nextMaturity: string | null;
  status: 'open' | 'fully_funded' | 'running';
};

const num = (value: unknown): number => Number(value ?? 0);
const str = (value: unknown): string => String(value ?? '');

export async function loadActiveProjects(q: QueryFn): Promise<ActiveProject[]> {
  const rows = await q(
    `WITH sched AS (SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1),
run AS (SELECT o."productId", COUNT(*)::int AS running_orders, COALESCE(SUM(o."totalAmount"),0)::float8 AS running_amount, COUNT(DISTINCT o."userId")::int AS running_investors,
  to_char(MIN(COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text,' ',1)::int * interval '1 month'))) + interval '6 hours','YYYY-MM-DD') AS next_maturity
  FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id
  JOIN "user" u ON u.id = o."userId" AND u."deletedAt" IS NULL AND u."userType"::text = 'investor'
  WHERE o."deletedAt" IS NULL AND o.status::text = 'invested' GROUP BY o."productId"),
sold AS (SELECT o."productId", COALESCE(SUM(o.quantity),0)::int AS units_sold FROM "order" o
  JOIN "user" u ON u.id = o."userId" AND u."deletedAt" IS NULL AND u."userType"::text = 'investor'
  WHERE o."deletedAt" IS NULL AND o.status::text IN ('invested','closed') GROUP BY o."productId")
SELECT p.id, p.name, split_part(p."productDuration"::text,' ',1)::int AS tenure, p."productReturnType"::text AS return_type,
  COALESCE(p.price,0)::float8 AS unit_price, COALESCE(p.stock,0)::int AS units_left, COALESCE(sold.units_sold,0) AS units_sold,
  COALESCE(p."isActive",FALSE) AS is_active, COALESCE(run.running_orders,0) AS running_orders, COALESCE(run.running_amount,0) AS running_amount,
  COALESCE(run.running_investors,0) AS running_investors, run.next_maturity
FROM products p LEFT JOIN run ON run."productId" = p.id LEFT JOIN sold ON sold."productId" = p.id
WHERE p."deletedAt" IS NULL AND (COALESCE(p."isActive",FALSE) OR COALESCE(run.running_orders,0) > 0)
ORDER BY (COALESCE(p."isActive",FALSE) AND COALESCE(p.stock,0) > 0) DESC, COALESCE(run.running_amount,0) DESC, p.name LIMIT 100`,
  );
  return rows.map((row) => {
    const unitsLeft = num(row.units_left);
    const unitsSold = num(row.units_sold);
    const isActive = row.is_active === true;
    const totalUnits = unitsSold + unitsLeft;
    return {
      projectId: num(row.id),
      name: str(row.name),
      tenureMonths: num(row.tenure),
      returnType: str(row.return_type),
      unitPrice: num(row.unit_price),
      unitsLeft,
      unitsSold,
      fundedPct: totalUnits === 0 ? null : (unitsSold / totalUnits) * 100,
      isActive,
      runningOrders: num(row.running_orders),
      runningAmount: num(row.running_amount),
      runningInvestors: num(row.running_investors),
      nextMaturity: row.next_maturity == null ? null : str(row.next_maturity),
      status: isActive ? (unitsLeft > 0 ? 'open' : 'fully_funded') : 'running',
    };
  });
}

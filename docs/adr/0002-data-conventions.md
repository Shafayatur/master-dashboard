# 0002. Data conventions
**Status:** accepted (2026-10-13)

- Server timestamps are UTC (`timestamp without time zone`); the business uses Dhaka time, so add 6 hours. Date filters are converted to half-open UTC ranges so indexes stay usable (`src/lib/time.ts`).
- node-postgres parses `timestamp without time zone` in the process timezone; we force UTC parsing (`src/lib/db/pg-types.ts`) so laptop and Vercel agree.
- Sales are counted from `deposits` (`"date"`, status `approved`), not from orders. `deposits."createdAt"` is not trustworthy.
- The DB declares no foreign keys; joins follow naming (`orderId`, `userId`, `productId`) and integrity is checked by `npm run db:check`.
- Every query filters `"deletedAt" IS NULL`.

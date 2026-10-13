# HANDOFF: Master Dashboard (investor-relations analytics)

Paste this whole file into a new Claude chat and attach `master-dashboard.zip` (the git repo, history included).
Everything needed to continue is below. Do not ask the user to repeat decisions already listed here.

---

## 1. Your role and how to work with the user
Act as a senior engineer, analyst and automation architect. The user is an AI intern on the Investor Relations (IR) team of an
investment platform. Be analytical and business-oriented, challenge weak assumptions, compare options, then recommend.

Working preferences (stated by the user):
- Concise, direct answers; no long explanations.
- After the first delivery, send **only changed files** plus a ready commit message per change, never full re-downloads.
- For file edits on macOS prefer Python scripts over `sed`.
- Debug methodically, evidence first: confirm the behaviour, then fix.
- Honest representation: label estimates as estimates (for example "estimated reinvestment").
- **Never use the company's name anywhere** (code, repo, docs, env vars, commit messages, UI copy, this kind of file). The user may reuse the project personally. Use neutral terms such as "source DB", "the platform", "investors".
- Never ask the user to paste secrets into chat. Secrets live in `.env.local` and Vercel environment variables.
- You cannot reach the user's databases or push to GitHub from the chat sandbox. You can build, test and zip code; the user runs it against the real DB and pushes.

## 2. Goal
A professional, unique, "every company's dream" internal dashboard, **live on the source PostgreSQL DB**, used to make decisions and generate ideas,
not just report. Must be filterable everywhere, exportable (CSV, Excel, PDF), animated, clean, with tabs. Internal only, behind a login.

## 3. Locked decisions
| Topic | Decision |
|---|---|
| Stack | Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, Recharts, Framer Motion, TanStack Query/Table, `pg`, Zod |
| API | Next.js route handlers as a thin read-only API; the browser never talks to the DB |
| Time | Source DB stores UTC (`timestamp without time zone`). **Add 6 hours** (Dhaka). Filters are converted to half-open UTC ranges |
| Investors | `user."userType" = 'investor'` only (other values are internal staff/admin accounts) |
| Soft deletes | Every query filters `"deletedAt" IS NULL` |
| Sales | From `deposits`: `"date"` column (NOT `createdAt`, which is fake) with status `approved`. Deposit status is a multi-select filter (approved / pending / rejected), default approved |
| Reinvest deposits | Count in sales, with a toggle to exclude |
| Cancelled orders with approved deposit | Rare; ignore |
| Other tables | Their `createdAt` is reliable (only `deposits.createdAt` is not) |
| Auth | One shared passkey set by the owner in an env var (stored hashed), signed httpOnly session cookie, login attempt limiting via the config DB. All IR users get full access, including PII in exports |
| Hosting | Vercel first (test early that the source DB is reachable; it may be IP-restricted). Fallback: same app in Docker on a VPS |
| Config DB | Neon Postgres project `master-dashboard` (AWS US East 2, pooled connection) for dashboard-owned data: monthly targets, settings, export log, login attempts. The source DB is read-only |
| Targets | Manual monthly target input with a month picker |
| Numbers | Show compact amounts like 21.11M, with a toggle to lakh/crore |
| Design | Not bound to any brand palette. Direction: ink-navy sidebar on a light canvas, emerald for money/growth, amber for attention, rose for negative, colour-blind-safe categorical set, dark mode, tabular numerals. Animated count-up KPIs, chart draw-in, subtle tab transitions, skeleton loaders. Avoid a generic templated look |
| Repo | https://github.com/Shafayatur/master-dashboard (private recommended: SQL reveals DB structure). Commits authored with shafayaturrahman21@gmail.com |
| Git workflow | `main` protected, feature branches via PR, Conventional Commits, CI (lint, typecheck, test, build), Dependabot, PR template, CODEOWNERS |

## 4. Source DB structure (no foreign keys are declared; join by naming)
Sensitive columns (passwords, tokens, biometric fields, national ID and tax numbers; also bank account and routing numbers in investor_bank) are omitted below and must **never** be selected.
Types: ts = `timestamp without time zone` (UTC), enum = Postgres enum.

- **user** (~23327 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, avatar:varchar, dateOfBirth:ts, email:varchar, phone:varchar, roleId:int, isEmailVerified:bool, isPhoneVerified:bool, userType:enum, name:varchar, gender:varchar
- **order** (~18834 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, status:enum, quantity:int, totalAmount:float, investmentDate:ts, userId:int, productId:int
- **deposits** (~14263 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, date:ts, amount:float, paymentMethod:enum, status:enum, attachment:varchar, remarks:varchar, createdById:int, updatedById:int, orderId:int, bankReferenceNumber:varchar, depositDate:ts, fromBankName:varchar, toBankName:varchar, remarksFromAccounts:varchar
- **returns** (~15931 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, date:ts, amount:float, paymentMethod:enum, remarks:varchar, createdById:int, updatedById:int, orderId:int, fromBankName:varchar, toBankName:varchar, bankReferenceNumber:varchar, remarksFromAccounts:varchar, status:enum
- **return_schedules** (~7729 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, installmentNumber:int, totalInstallments:int, paymentDate:ts, profitAmount:float, principalAmount:float, totalAmount:float, orderId:int
- **products** (~492 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, name:varchar, sku:varchar, isActive:bool, isFeatured:bool, description:text, price:float, isInsuranceApplicable:bool, location:varchar, productDuration:enum, installment:int, productReturnType:enum, returnAmountIfFixedAmount:float, returnAmountMinimumPercentage:float, returnAmountMaximumPercentage:float, stock:int, thumbnailImage:varchar, images:text, createdById:int, updatedById:int, riskLevel:enum, riskAndProtection:text, preferredReturnPercentage:float, isShariah:bool
- **categories** (~4 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, name:varchar, isActive:bool, image:varchar, order:int, createdById:int, updatedById:int
- **category_products** (~969 rows): categoriesId:int, productsId:int
- **investor_bank** (~5697 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, bankName:varchar, branchName:varchar, accountName:varchar, userId:int, districtName:varchar
- **nominee** (~5297 rows): id:int, uuid:uuid, createdAt:ts, updatedAt:ts, deletedAt:ts, name:varchar, phone:varchar, relationship:varchar, userId:int

Enum values: `order.status` = closed 10427, cancelled 5391, invested 2984, booked 24, verifying 9.
`deposits.status` = approved 14248, pending 9, rejected 6. `deposits.paymentMethod` = bank_deposit, cash, reinvest (24), cheque.
`returns.status` = completed 15827, initiated 96. `products.productDuration` = 1 to 36 Months (4, 6, 3, 12, 2 months most common).
`products.productReturnType` = percentage-range, percentage, fixed. `products.riskLevel` = "Low Risk" for all products (useless as a filter).
`user.userType` = investor (23311) plus a few internal staff/admin accounts.
Joins: `deposits."orderId" -> "order".id`, `"order"."userId" -> "user".id`, `"order"."productId" -> products.id`,
`returns."orderId" -> "order".id`, `return_schedules."orderId" -> "order".id`, `category_products` links categories and products.
`"order"` and `"user"` need double quotes; so do camelCase columns.

## 5. Metric dictionary (also in `docs/metrics.md`; keep both in sync)
- **Investment value (payment):** `SUM(deposits.amount)` by `deposits."date"` (+6h), selected deposit statuses (default approved).
- **Registrations (interest):** investor users by `user."createdAt"`.
- **Tickets booked (consideration):** orders in the period, any status; show cancelled share.
- **Tickets invested:** orders with an approved deposit in the period.
- **Unique / new / old investors:** distinct `order."userId"` on approved deposits. New = first-ever approved deposit falls in the period; old = had one before the period start.
- **Conversion:** share of a registration cohort with an approved deposit within 7 / 30 / 90 days and ever; median days to first investment.
- **Payouts:** paid = `returns.status = 'completed'` by `returns."date"`; in flight = `initiated`; upcoming = `return_schedules."paymentDate"`.
- **Target vs actual:** month-to-date sales vs manual target, with run-rate projection and required daily amount.
- **Reinvestment, three labelled levels:** (1) confirmed: `paymentMethod = 'reinvest'`; (2) payout-linked (estimated): approved deposit by an investor paid out in the previous 30 days (window adjustable); (3) repeat investor: 2nd or later investment. Decision metric: payout-to-reinvest rate within 30/60/90 days.
- **Maturity of an order:** last `return_schedules."paymentDate"`, else `"investmentDate" + productDuration`.
- **Segments (per investor across all orders):** Active = has an order with status `invested`. Otherwise by latest maturity: 0-30 days ago = Recently active, 30-60 = Cooling, over 60 = Inactive. Prospect = registered, never invested. Thresholds editable in `app_settings`.
- Also: investor tiers by lifetime value, best/preferred tenure, best projects (value, investor count, fill rate, days to fill), concentration (top 10 / top 20% share).

## 6. Dashboard spec
Tabs: **Command Center** (funnel strip, KPI cards with deltas, target pacing, auto "what changed" insights, needs-attention counters) ·
**Sales** · **Investors** (segments, tiers, cohort retention heatmap, concentration) · **Projects & Tenure** (scorecards, preferred tenure, "what to launch next") ·
**Money Flow** (maturity/payout calendar, reinvestment tiers) · **Action Lists** (ready to reinvest: maturing in 7-14 days; cooling investors; stuck bookings; pending deposits; each exportable as a call sheet) ·
**Investor 360** drawer + global search · **Targets** · **Data Explorer** (raw tables with export).
Global filter bar persisted in the URL: date range with presets and period comparison, deposit status, order status, payment method, product, category, tenure, return type, Shariah, investor type, segment.
Optional later: weekly AI narrative from aggregated numbers only (never raw investor rows).

## 7. Code conventions
- One SQL function per metric under `src/lib/queries/`; always parameterised; `"deletedAt" IS NULL`; investors only; dates via `src/lib/time.ts`.
- All source-DB access goes through `querySource()` (SELECT-only guard + read-only session). Dashboard-owned data goes through `queryConfig()`.
- Each query gets a test. SQL is validated against an in-memory Postgres (PGlite) built from `db/fixtures/schema.sql` (see `src/lib/sanity/checks.test.ts`).
- Update `docs/metrics.md` in the same change as any metric definition.
- Do not run `npm run build` with real secrets in CI; env validation is lazy so the build works without them.

## 8. What is done (Phase 0, branch `feat/phase-0-foundation`, not yet merged)
Verified: lint, typecheck, 24 tests and production build all pass from a fresh clone.
- Next.js 14 + TS + Tailwind + Vitest scaffold; placeholder home page.
- `src/lib/env.ts`: Zod env validation (lazy). Variables: `SOURCE_DATABASE_URL`, `SOURCE_DB_SSL`, `SOURCE_DB_SSL_REJECT_UNAUTHORIZED` (false: self-signed cert), `SOURCE_DB_POOL_MAX`, `CONFIG_DATABASE_URL`, `HEALTH_TOKEN`.
- `src/lib/time.ts`: Dhaka helpers (+6h, range to UTC). `src/lib/db/pg-types.ts`: forces UTC parsing of `timestamp without time zone` and numeric parsing of bigint counts.
- `src/lib/db/source.ts` (read-only pool + SELECT-only guard in `src/lib/sql/guard.ts`), `src/lib/db/config.ts` (Neon pool), `pool-config.ts` (strips `sslmode`, sets TLS explicitly).
- `src/app/api/health/route.ts`: needs header `x-health-token` equal to `HEALTH_TOKEN` (404 if unset); reports connectivity of both DBs.
- `db/config/001_init.sql` + `scripts/migrate-config.ts` (`npm run db:migrate`): tables `monthly_targets`, `app_settings` (segment thresholds, reinvest window), `export_log`, `login_attempts`.
- `scripts/sanity-check.ts` + `src/lib/sanity/checks.ts` (`npm run db:check`): 12 aggregate-only checks, writes `reports/sanity-<date>.md`. Run with `tsx --conditions=react-server` because of the `server-only` import.
- CI workflow, Dependabot, PR template, CODEOWNERS, README, CONTRIBUTING, `docs/metrics.md`, ADRs 0001-0003.
- Git: `main` has one initial commit; the branch has 10 conventional commits.

## 9. Waiting on the user
1. Push both branches to GitHub, open the PR, confirm CI is green.
2. Create `.env.local` from `.env.example`. `HEALTH_TOKEN` is any random string of 16+ characters, for example `openssl rand -hex 24`.
3. Run `npm run db:migrate` (Neon tables) and `npm run db:check`, then paste `reports/sanity-<date>.md` into the chat.
4. Get a read-only DB user from the tech team and confirm the source DB is reachable from outside the company network.
5. Deploy the branch on Vercel with the env vars and call `/api/health` to prove connectivity.
6. Reconcile the sales-by-month numbers (check 6) against the existing IR daily tracker.

## 10. Roadmap
| Phase | Deliverable |
|---|---|
| 1 | Passkey login (hash in env, signed cookie, attempt limiting), app shell, filter bar with URL state, Command Center |
| 2 | Sales and Projects & Tenure |
| 3 | Investors, segmentation, cohorts, Investor 360, global search |
| 4 | Money Flow, Action Lists, Targets |
| 5 | Data Explorer, exports (CSV/XLSX/PDF), export log |
| 6 | Polish, animation, docs, production deploy |
Acceptance for every phase: lint, typecheck, tests green; numbers reconciled with the source; metric docs updated; delivery as changed files + commit messages.

## 11. Open risks and questions
- Source DB may block Vercel IPs; test early. Serverless needs a small connection pool (default 3).
- Sanity report may reveal bad dates, orphaned rows, or invested orders already past maturity; adjust metric definitions before building charts.
- `return_schedules` has no status column, so "upcoming payouts" is inferred; schedule covers only part of the orders (fallback: investment date + duration).
- Shared passkey means no per-person audit trail; per-person login can replace it later.

## 12. First message for the new chat
"Continue from HANDOFF.md. Phase 0 is done and pushed. Here is the sanity report: <paste>. Start Phase 1."

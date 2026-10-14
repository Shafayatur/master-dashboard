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
- You cannot reach the user's databases, Vercel or GitHub from the chat sandbox. You can build, test and verify code against a local Postgres and a headless browser; the user runs it against the real DB and pushes.

**Delivery workflow (agreed 2026-10-14, replaces "changed files + zips")**
- No zips. Each chunk ships as ONE `.patch` file (`git diff <previous commit> HEAD`) plus a ready commit message. The user runs `git apply --check`, `git apply`, deletes the patch file, then `npm ci` if dependencies changed, `npm test`, commits and pushes.
- Chunks are small and must finish inside one session. Never leave a chunk half-built; split earlier instead.
- **Every patch also updates this file** (sections 8-10 at least), so work can move to another account at any time. Verify the patch applies on a pristine checkout, then run lint, typecheck, tests and build there before delivering.
- State plainly what was verified (tests, local Postgres, headless browser) and what was not (the user's real databases, Vercel).
- macOS notes: zsh treats `#` in pasted commands as arguments, so never put comments on command lines. Files in `~/Downloads` can be unreadable from Terminal ("Operation not permitted"): copy the patch into the repo folder with Finder, apply, delete it. Node must be 22.12 or newer (`nvm use` reads `.nvmrc`).
- To hand over to another account: `git archive -o master-dashboard-src.zip HEAD` (tracked files only, so no secrets), paste this file, attach the zip. Never zip `.env.local`.

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
| Architecture (2026-10-14, ADR 0004) | Server components call `src/lib/queries/` directly instead of an API plus TanStack Query. Conditions: `requireSession()` in every page and route handler (guard test); route handlers return for on-demand fetches (search, Investor 360 drawer, Data Explorer, exports); queries are `server-only`, 60 s auto-refresh via `router.refresh()`, Suspense keyed by filters, charts get aggregates only; each metric query wrapped in `unstable_cache` (60 s, keyed by filters, JSON-only values); pool default 3 until the tech team confirms the connection limit |
| Filter honesty | A filter a tab cannot apply shows a visible "not applied here" notice, never silently ignored |
| Reconciliation | Monthly sales (deposits `"date"` +6h, approved) matched the IR daily tracker for Sept 2026 |
| Registration spikes | Jan/Apr/Dec 2023 spikes are real; no exclusion |
| Products | `products.stock` = units remaining. Fill rate = sold / (sold + left). Shariah filter hidden until a Shariah product exists (0 of 496 today) |
| Active segment | Active = has an invested order not yet matured (default adopted; 290 invested orders are past maturity). Overdue orders get their own attention counter |
| Currency text | Use "BDT" text, not a currency symbol (font fallback) |

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
- **Investment value (payment):** `SUM(deposits.amount::numeric)` by `deposits."date"` (+6h), selected deposit statuses (default approved), capped at today (future-dated rows excluded and counted). Reconciled with the IR tracker.
- **Registrations (interest):** investor users by `user."createdAt"`.
- **Tickets booked (consideration):** orders in the period, any status; show cancelled share.
- **Tickets invested:** DISTINCT orders with an approved deposit in the period (an order can have several approved deposits, so tickets differ from deposit counts).
- **Unique / new / old investors:** distinct `order."userId"` on approved deposits. New = first-ever approved deposit falls in the period; old = had one before the period start.
- **Conversion:** share of a registration cohort with an approved deposit within 7 / 30 / 90 days and ever; median days to first investment.
- **Payouts:** paid = `returns.status = 'completed'` by `returns."date"`; in flight = `initiated`; upcoming = `return_schedules."paymentDate"`.
- **Target vs actual:** month-to-date sales vs manual target, with run-rate projection and required daily amount.
- **Reinvestment, three labelled levels:** (1) confirmed: `paymentMethod = 'reinvest'`; (2) payout-linked (estimated): approved deposit by an investor paid out in the previous 30 days (window adjustable); (3) repeat investor: 2nd or later investment. Decision metric: payout-to-reinvest rate within 30/60/90 days.
- **Maturity of an order:** last `return_schedules."paymentDate"`, else `"investmentDate" + productDuration`.
- **Segments (per investor across all orders):** Active = has an `invested` order that has not yet matured (updated 2026-10-14; overdue invested orders get their own attention counter). Otherwise by latest maturity: 0-30 days ago = Recently active, 30-60 = Cooling, over 60 = Inactive. Prospect = registered, never invested. Thresholds editable in `app_settings`.
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
- Every file in `src/lib/queries/` starts with `import 'server-only'`. Every page calls `await requireSession()`; every route handler starts with `requireSessionApi()` (allow-list in `src/lib/auth/require-session.test.ts`).
- Money: `SUM(amount::numeric)`. Cached values must be plain JSON.
- Never wrap `cookies()`, `headers()` or `searchParams` access in `try/catch`: it swallows Next's dynamic-rendering signal and Next prerenders the page statically at build (a login redirect was once baked in that way; regression tests exist). Always smoke-test the BUILT app (`next build` then `next start`) with and without a session, and check the route table shows `ƒ` (dynamic) for every app page.
- Source DB access: `querySource()` awaits a read-only session setting once per pooled connection (no fire-and-forget queries).

## 8. What is done
Verified on the user's machine unless noted. Branch names are historical; everything is meant to land on `main` through PRs.
- **Phase 0 foundation** (merged or pending PR): Next.js 14, Zod env, Dhaka time helpers, read-only source pool with SELECT-only guard, Neon config DB + migration, health endpoint, 12-check sanity report, CI, docs.
- **Patch 001** (fix): env validated per database; source DB configurable as one URL or as `SOURCE_DB_HOST/PORT/USER/PASSWORD/NAME` (password percent-encoded explicitly). `db:migrate` needs only the Neon URL.
- **Patch 002** (feat): shared-passkey sign-in (scrypt hash in env, HMAC-signed httpOnly cookie, 7 days, signs out when the passkey changes), login attempt limiting in the config DB (5 per address / 15 min, 40 global, fails closed), middleware gate, app shell (navy sidebar, 8 tab placeholders, dark mode, mobile drawer), URL-state filter bar (date presets and custom range, comparison period, deposit/order/payment filters, reinvest toggle, tenure, return type, Shariah, investor kind, segment), design tokens. 57 tests. Verified in headless Chromium and against a local Postgres with TLS.
- **Patch 003 / chunk A** (foundations, no UI): `requireSession()` on every page plus guard test; `querySource` read-only session fix (removes the pg deprecation warning); `server-only` test stub; sanity checks 13-16; ADR 0004; metric dictionary v0.2.
- Command Center and all other tabs are still placeholders.

### Sanity report findings (2026-10-14, aggregate)
Clean: all relationship checks show zero orphans; server is UTC; deposit timestamps carry time of day; payout dates sit at 18:00 UTC (Dhaka midnight), consistent with +6h.
Numbers: approved sales about 1.75B BDT in 14,310 deposits; recent months 44-51M BDT (peak 80.2M in April 2026); 23,360 registered investors, 2,516 ever invested (10.8%); monthly unique investors 133-466; 496 products, 8 active, 0 Shariah; reinvest deposits 34 (0.2% of sales).
Open findings: (1) deposits and completed payouts exist dated up to 19 Oct 2026 while the server clock read 14 Oct; check 13 quantifies them. (2) 290 invested orders (9.7%) are past maturity; check 14 shows how late. (3) check 10's median (10.8) equals the conversion percentage (10.8), possibly coincidence; check 16 settles it; 51 investors have a first deposit before registration. (4) By arithmetic, all 29 pending/rejected deposits are dated October 2026 (an inference: older rejected rows may be purged, so the status filter matters mostly for the current month). (5) `return_schedules` covers 2,927 of 3,005 invested orders. (6) 112 invested and 482 closed orders have several approved deposits.

## 9. Waiting on the user
1. Apply patch 003, run `npm test` (expect 80 passing), commit, push.
2. Run `npm run db:check` again and paste only checks 13-16 from `reports/sanity-<date>.md` (results feed chunk B/C decisions).
3. Ask the tech team: the source DB connection limit, the DB region, and whether Vercel IPs must be allow-listed (static IPs are a paid Vercel add-on).
4. Before putting DB credentials on a hosting account, get company approval (the credentials and investor data pass through that host). Vercel Hobby is non-commercial; an internal company tool needs a team/Pro plan or the VPS fallback.
5. Deploy checklist (when approved): merge the PR to `main`; import the repo in Vercel; Node 22.x; set env vars for Production only (`SOURCE_DB_*`, `SOURCE_DB_SSL=require`, `SOURCE_DB_SSL_REJECT_UNAUTHORIZED=false`, `SOURCE_DB_POOL_MAX=3`, `CONFIG_DATABASE_URL`, `HEALTH_TOKEN`, `AUTH_PASSKEY_HASH`, `SESSION_SECRET`); deploy; open the URL (expect redirect to `/login`, then sign in); then `curl -H "x-health-token: <token>" https://<project>.vercel.app/api/health` and expect both databases connected. Set the function region near the source DB. If the source DB refuses the connection, send the error text only.

## 10. Roadmap (small chunks, each one patch plus an updated handoff)
| Chunk | Deliverable | Status |
|---|---|---|
| A | Foundations: session guard, pg fix, checks 13-16, ADR 0004, metrics v0.2 | done (patch 003) |
| B | Query layer: filters-to-SQL builder, KPI queries with tests, `unstable_cache` wrapper, number formatting util (no UI) | next |
| C | Command Center UI 1: 8 KPI cards with deltas and count-up, lakh/crore toggle, skeletons, error state, 60 s auto-refresh, "not applied here" notices, product/category filter options, hide Shariah when none | |
| D | Command Center UI 2: daily trend vs comparison period, funnel strip | |
| E | Target pacing (read `monthly_targets`, set-target server action) and attention counters | |
| F | "What changed" rule-based insights | |
| G-H | Phase 2: Sales tab; Projects & Tenure (fill rate, preferred tenure, what to launch next) | |
| I-K | Phase 3: Investors (segments, tiers), cohorts and concentration, Investor 360 drawer and global search (route handlers) | |
| L-N | Phase 4: Money Flow, Action Lists (call sheets), Targets page | |
| O-P | Phase 5: Data Explorer, exports (CSV, XLSX, PDF) and export log | |
| Q | Phase 6: polish, Next.js upgrade (current audit shows critical advisories on Next 14), production deploy | |
Acceptance for every chunk: lint, typecheck, tests green; patch verified on a pristine checkout; metric docs updated; this file updated.

## 11. Open risks and questions
- Source DB may block Vercel IPs; not yet tested from Vercel. Serverless needs a small pool (default 3) and cached queries.
- Next.js 14 has open advisories (denial of service, PostCSS); upgrade as its own PR before production.
- Shared passkey means no per-person audit trail; per-person login can replace it later.
- The 5-day future-dated rows (finding 1) need a decision once check 13 shows their size.
- Source DB region versus Neon region (us-east-2) affects latency; caching mitigates it.

## 12. First message for the new chat
"Continue from HANDOFF.md. Last completed: chunk A (patch 003). Next: chunk B. Here are sanity checks 13-16: <paste>."

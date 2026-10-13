# master-dashboard

Internal, login-protected analytics dashboard for the Investor Relations team: sales, investors,
projects, payouts, targets and action lists, live from the source PostgreSQL database.

**Status:** phase 0 (foundation). See `docs/` for the metric dictionary and decisions.

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind · Recharts · `pg` · Neon Postgres (dashboard config) · Vitest · GitHub Actions

## Getting started
```bash
nvm use                      # Node 20
npm ci
cp .env.example .env.local   # fill in values, never commit this file
npm run db:migrate           # creates tables in the Neon config DB
npm run db:check             # data sanity report -> reports/sanity-<date>.md
npm run dev                  # http://localhost:3000
```

| Command | Purpose |
|---|---|
| `npm run lint` / `typecheck` / `test` | Checks run in CI |
| `npm run db:check` | Aggregate data-quality report against the source DB (safe to share) |
| `npm run db:migrate` | Applies `db/config/*.sql` to the Neon config DB |

## Environment
See `.env.example`. Two databases: the **source DB** (read-only role) and the **Neon config DB** (read/write, dashboard-owned data).
`GET /api/health` with header `x-health-token: <HEALTH_TOKEN>` reports connectivity of both.

## Deploying to Vercel
1. Import the repo, framework Next.js.
2. Add the environment variables from `.env.example` (Production and Preview).
3. Verify `/api/health`. If the source DB is unreachable from Vercel (IP allow-list), run the same app in Docker on a VPS instead.

## Project layout
```
src/app/          Next.js routes (UI + /api)
src/lib/db/       Connection pools (source read-only, Neon config)
src/lib/sql/      SELECT-only guard
src/lib/time.ts   Dhaka (UTC+6) helpers
src/lib/sanity/   Data sanity SQL
db/config/        Neon migrations
db/fixtures/      Structure-only source schema snapshot for tests
docs/             Metric dictionary and architecture decisions
```

See `CONTRIBUTING.md` for the branch and commit rules.

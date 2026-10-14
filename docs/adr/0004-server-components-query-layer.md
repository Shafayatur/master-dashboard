# 0004. Server components call the query layer directly
**Status:** accepted (2026-10-14). Amends the "thin read-only API + TanStack Query" plan in ADR 0001.

## Decision
Pages are Next.js server components. They read the filters from `searchParams`, call functions in
`src/lib/queries/` and render. The browser never talks to the database and receives only rendered output
and aggregated props.

## Why
Filters already live in the URL, so a server render per filter change needs no client data layer.
Less code, no duplicated validation, no client cache to keep in sync.

## Conditions (all four are part of the decision)
1. **Every page and route handler checks the session itself** (`requireSession()` / `requireSessionApi()`),
   not only the middleware. A test (`src/lib/auth/require-session.test.ts`) fails if a page or route handler is
   added without the call, unless it is on the explicit allow-list.
2. **Route handlers still exist where the browser fetches on demand**: global search type-ahead, the Investor 360
   drawer, the Data Explorer table and exports. TanStack Query is used only for those client-driven pieces.
3. **The data layer is server-only and refresh is explicit.**
   - Every file in `src/lib/queries/` imports `server-only`, so the build fails if a client component imports one.
   - Auto-refresh is a small client component that calls `router.refresh()` every 60 seconds.
   - Each `Suspense` boundary is keyed by the filters, so skeletons show when a filter changes.
   - Client chart components receive aggregated props only, never raw rows.
4. **Connection pressure is managed.** Each metric query is wrapped in `unstable_cache`, keyed by the filters,
   with a 60-second TTL, so all users share results. Cached values must be plain JSON (no `Date`, no `bigint`).
   The source pool defaults to 3 connections per instance; raise it (about 5) only after the tech team confirms
   the database connection limit.

## Consequences
Data on screen can be up to about a minute old; the UI shows when it was generated.

# 0001. Stack: Next.js + Recharts with a thin read-only API
**Status:** accepted (2026-10-13)

**Context.** Needed a live, filterable, animated, exportable dashboard on the company's PostgreSQL DB. Considered Metabase, Streamlit, and a custom React app.

**Decision.** Next.js 14 (App Router, TypeScript), Tailwind, Recharts, Framer Motion, `pg`. Route handlers act as the API layer so the browser never talks to the DB.

**Why.** Metabase is faster to start but cannot deliver the custom look, animation and action lists. Data is small (tens of thousands of rows), so plain indexed queries are fast and no materialised views are needed.

**Consequences.** More build effort than a BI tool; full control over UX, exports and security. The same app runs on Vercel or in Docker.

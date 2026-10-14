# Contributing

## Branches
- `main` is protected: changes land only through pull requests with a green CI run.
- Work on short-lived branches: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.
- Prefer squash-merge so `main` stays one commit per change.

## Commits ([Conventional Commits](https://www.conventionalcommits.org))
`type(scope): summary`, imperative, under 72 characters.
Types: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`.

## Rules for this codebase
1. **One SQL file/function per metric** in `src/lib/queries/`. Every query is parameterised, filters
   `"deletedAt" IS NULL`, restricts users to `userType = 'investor'` and shifts dates by +6h via `src/lib/time.ts`.
2. **The source DB is read-only.** Anything the dashboard owns (targets, settings, logs) lives in the Neon config DB.
3. **Never commit secrets or data.** Use `.env.local` locally and Vercel environment variables in production.
4. **Metric definitions live in `docs/metrics.md`.** Change the doc in the same PR as the code.
5. New queries get a test; `npm run db:check` must stay green against the real DB before merging data changes.

# Build state

| Chunk | Status |
|---|---|
| Phase 0 foundation, env, auth, app shell, filter bar, session guard | merged to `fix/env-connection-parts` |
| Command Center data layer (queries, formatting, insights) | this patch, 107 tests passing |
| Command Center screen (KPI cards, trend chart, target ring, funnel, attention, insights, auto-refresh, unit toggle) | this PR (feat/command-center-screen) |
| Sales, Projects & Tenure | after that |
| Investors + segments, Money Flow, Action Lists, Targets, Explorer, exports | later phases |
| Chart toolkit (KpiCard, Sparkline, DonutChart, AreaChart, HBarList, Heatmap, ExportBar) and the `/design` gallery; see `docs/design.md` | this PR (feat/chart-toolkit) |
| Command Center visual data (`kpiSpark`, payouts, sales vs reinvest, project/category donuts, segments, recent activity); see `docs/metrics.md` | this PR (feat/home-data) |

Open items: sanity report not yet reviewed against real data; target rows are added in Neon until the Targets tab exists.

## What and why
<!-- One or two sentences. Link the phase/issue. -->

## Metric or data changes
- [ ] No metric definition changed
- [ ] Metric definition changed: `docs/metrics.md` updated and numbers re-checked against the the existing IR daily tracker

## Checklist
- [ ] `npm run lint && npm run typecheck && npm test` pass locally
- [ ] No secrets, connection strings or investor data committed
- [ ] New SQL is parameterised, filters `"deletedAt" IS NULL`, and shifts dates +6h (Dhaka)

# Metric dictionary (v0.2, 2026-10-14)

All dates are Dhaka time (stored UTC + 6h). All investor figures use `user."userType" = 'investor'` and
exclude soft-deleted rows (`"deletedAt" IS NOT NULL`). Amounts are BDT.

## Sales
| Metric | Definition |
|---|---|
| Investment value | `SUM(deposits.amount)` by `deposits."date"` for the selected deposit statuses (default `approved`). `deposits."createdAt"` is unreliable and never used. |
| Reinvest deposits | `deposits."paymentMethod" = 'reinvest'`; included in sales, with a toggle to exclude. |
| Cancelled orders with approved deposits | Rare (44 of 5,417 cancelled orders on 2026-10-14); ignored, as decided. |
| Future-dated rows | Deposits and payouts dated after today exist. Every "to date" figure is capped at today (Dhaka); a counter shows how many rows are excluded. |
| Reconciliation | Monthly sales by `deposits."date"` (+6h, approved) matched the IR daily tracker for September 2026. |
| Money arithmetic | Amount columns are `float`. Always `SUM(amount::numeric)` and round for display. |

## Funnel
| Metric | Definition |
|---|---|
| Registrations (interest) | Investor users by `user."createdAt"` |
| Tickets booked (consideration) | Orders in the period (any status), cancelled share shown separately |
| Tickets invested | Distinct orders with an approved deposit in the period. An order can have several approved deposits (about 4% of invested and closed orders), so tickets differ from deposit counts. |
| Unique / new / old investors | Distinct `order."userId"` on approved deposits. New = first-ever approved deposit falls in the period; old = had one before the period start |
| Conversion | Share of a registration cohort with an approved deposit within 7 / 30 / 90 days and ever |

## Segments (per investor, across all their orders)
Maturity of an order = last `return_schedules."paymentDate"`, else `investmentDate + productDuration`.

| Segment | Rule |
|---|---|
| Active | Has an order with status `invested` that has **not yet matured**. *(Default adopted 2026-10-14: 290 invested orders, 9.7%, are already past maturity; they must not make an investor look active. Change if IR disagrees.)* |
| Recently active | Latest maturity 0-30 days ago |
| Cooling | Latest maturity 30-60 days ago |
| Inactive | Latest maturity more than 60 days ago |
| Prospect | Registered, never invested |

Investors who are not Active are bucketed by their latest maturity across all non-cancelled orders. Invested orders past maturity are also an
"overdue" attention counter and feed the "ready to reinvest" list. Thresholds are editable (`app_settings.segment_thresholds`).

## Reinvestment (three levels, labelled honestly in the UI)
1. **Confirmed**: deposit with `paymentMethod = 'reinvest'`.
2. **Payout-linked (estimated)**: approved deposit by an investor who received a completed payout in the previous 30 days.
3. **Repeat investor**: the investor's 2nd or later investment.

Observed 2026-10-14: confirmed reinvest deposits are 34 (about 0.2% of sales), so level 2 is the metric that carries decisions.

## Products
| Metric | Definition |
|---|---|
| Units sold | `SUM(order.quantity)` over orders with status `invested` or `closed` |
| Units left | `products.stock` (confirmed: units remaining) |
| Fill rate | sold / (sold + left). Sanity check 15 verifies this reading. |
| Shariah filter | Shown only when at least one product is Shariah (0 of 496 on 2026-10-14). |
| Active products | 8 of 496 on 2026-10-14. |

## Money out
Paid = `returns.status = 'completed'` by `returns."date"`; in flight = `initiated`; upcoming = `return_schedules."paymentDate"`.

## Targets
Entered manually per month (`monthly_targets`, Neon). Achievement = month-to-date sales / target.

## Command Center definitions (implemented in `src/lib/queries/overview.ts`)
- **Ticket** = one order. Tickets booked use `order."createdAt"` (any status, cancelled share shown); tickets invested = distinct orders with a matching deposit in the period.
- **Registrations, booked and invested are period activity, not a cohort funnel.** Cohort conversion arrives with the Investors tab.
- **Deposit/order/product filters** apply to sales, tickets invested, investors and the trend. Registrations ignore them. The Segment filter is not applied on this page yet.
- **Needs attention** is always "right now" and ignores the filters: pending deposits, bookings open more than 3 days, payouts in flight, investments maturing in the next 14 days.
- **Target pacing** compares month-to-date approved sales (all products, investors only) with the manual monthly target; projection = actual / days elapsed x days in month.
- Trend is daily up to 92 days, monthly beyond that; the compare line is aligned by position in the period.

## Command Center visuals (implemented in `src/lib/queries/home.ts`)
`getHome()` returns the Command Center data plus everything the visual layout needs. All timestamps are shifted +6h (Dhaka); amounts are BDT; every query is investors only with `"deletedAt" IS NULL`.
- **Sparklines (`kpiSpark`)**: one value per `series` label, zero-filled, same buckets as the trend (daily up to 92 days, monthly beyond). Sales, tickets invested and unique investors use the same filtered deposits as the KPI cards (tickets and investors are distinct per bucket, so they do not add up to the period total). Tickets booked use `order."createdAt"` (any status, product filters). Average ticket = sales / tickets invested per bucket, 0 without tickets.
- **New investors (spark)**: an investor with a filtered deposit in the range is counted once, in the bucket of their first-ever approved deposit when that falls inside the range, so the buckets add up to the KPI "new investors".
- **Registrations (spark)**: `user."createdAt"`; the deposit, order and product filters do not apply.
- **Payouts**: completed payouts (`returns.status = 'completed'`) by `returns."date"` in the same buckets; no product or deposit filters.
- **Sales vs reinvest**: approved deposits of the last 6 Dhaka months including the current one (up to today), split into `paymentMethod = 'reinvest'` and everything else. Ignores the filters and the selected range. `month` is the first day of the month.
- **By project / by category**: sales in the range with every active filter, top 5 plus an "Others" row for the rest; `share` is value / sum of the returned rows x 100. A product in several categories counts in each, so category shares are shares of that sum (it can exceed total sales).
- **Payouts by category**: completed payouts in the range by the paid order's product category, top 5 plus "Others", same multi-category rule, no filters.
- **Investor totals**: `registered` = all-time investors; `everInvested` = investors with at least one approved deposit; `active` = investors in segment Active. Segments reuse `segments()` from the Investors tab, which counts any `invested` order as running (it does not check maturity; see the Segments table above, which says "not yet matured": code and text still disagree).
- **Recent activity**: the latest 10 events, newest first, from approved or pending deposits (`deposits."date"`), completed payouts (`returns."date"`), investor registrations and bookings (orders with status `booked` or `verifying`, by `order."createdAt"`). Not filtered. Events dated after the current time are left out (the source contains a few future-dated rows).

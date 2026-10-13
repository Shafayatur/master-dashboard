# Metric dictionary (v0.1)

All dates are Dhaka time (stored UTC + 6h). All investor figures use `user."userType" = 'investor'` and
exclude soft-deleted rows (`"deletedAt" IS NOT NULL`). Amounts are BDT.

## Sales
| Metric | Definition |
|---|---|
| Investment value | `SUM(deposits.amount)` by `deposits."date"` for the selected deposit statuses (default `approved`). `deposits."createdAt"` is unreliable and never used. |
| Reinvest deposits | `deposits."paymentMethod" = 'reinvest'`; included in sales, with a toggle to exclude. |
| Cancelled orders with approved deposits | Rare; ignored. |

## Funnel
| Metric | Definition |
|---|---|
| Registrations (interest) | Investor users by `user."createdAt"` |
| Tickets booked (consideration) | Orders in the period (any status), cancelled share shown separately |
| Tickets invested | Orders with an approved deposit in the period |
| Unique / new / old investors | Distinct `order."userId"` on approved deposits. New = first-ever approved deposit falls in the period; old = had one before the period start |
| Conversion | Share of a registration cohort with an approved deposit within 7 / 30 / 90 days and ever |

## Segments (per investor, across all their orders)
Maturity of an order = last `return_schedules."paymentDate"`, else `investmentDate + productDuration`.

| Segment | Rule |
|---|---|
| Active | Has at least one order with status `invested` |
| Recently active | Latest maturity 0-30 days ago |
| Cooling | Latest maturity 30-60 days ago |
| Inactive | Latest maturity more than 60 days ago |
| Prospect | Registered, never invested |

Thresholds are editable (`app_settings.segment_thresholds`).

## Reinvestment (three levels, labelled honestly in the UI)
1. **Confirmed**: deposit with `paymentMethod = 'reinvest'`.
2. **Payout-linked (estimated)**: approved deposit by an investor who received a completed payout in the previous 30 days.
3. **Repeat investor**: the investor's 2nd or later investment.

## Money out
Paid = `returns.status = 'completed'` by `returns."date"`; in flight = `initiated`; upcoming = `return_schedules."paymentDate"`.

## Targets
Entered manually per month (`monthly_targets`, Neon). Achievement = month-to-date sales / target.

# Data lineage

## Sales

| Display | Data logic |
| --- | --- |
| Investment value | Sum of filtered deposits, using the same sales query and filters as the Sales tab KPI. |
| Investment by day | Same filtered sales series as the Command Center trend: daily buckets for ranges up to 92 days and monthly buckets for longer ranges, grouped by the deposit date in Dhaka time (UTC+6) and zero-filled across the selected range. The full bar total is split into other payment methods and `reinvest` (stacked on top). It honors the selected deposit-status filter (approved by default) and shows only the current period. |
| Booking activity | Investors-only orders of any status, created at `order."createdAt"` in Dhaka time, with deleted orders excluded and global product/order filters applied. Day view groups the selected global date range by weekday and hour; week, month, and year views use their own anchor-based windows and ignore the global date range. Week/month are daily counts; year groups by weekday and month. Future dates stay zero. |

## Investors

| Display | Data logic |
| --- | --- |
| New registrations | Investors whose account creation timestamp falls in the selected date range, grouped in Dhaka time and zero-filled by day for ranges up to 92 days or by month for longer ranges. Columns split into investors with at least one approved deposit and those without one. The deposit may have occurred after registration; staff and deleted users are excluded. Other Investors-tab cards remain snapshots. |

## Explorer

| Display | Data logic |
| --- | --- |
| Deposits, orders, payouts | Use the selected Explorer date range and its own status filter. Product, category, tenure, return-type, Shariah, and applicable payment-method filters are preserved from global filters; global deposit/order statuses are not applied. Investors, soft-deleted orders, and soft-deleted source records are excluded. CSV and Excel exports use the same filtered query as the table. |
| Investors: Segment | Classifies investors using the same rule and default thresholds as the Investors tab: active invested orders first, otherwise the most recent maturity of closed orders (latest non-deleted scheduled payment or investment date plus product duration) determines recently active, cooling, or inactive; investors without a qualifying order are prospects. Deleted users and staff are excluded. The selected `seg` value filters this column. |

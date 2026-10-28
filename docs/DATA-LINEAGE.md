# Data lineage

## Sales

| Display | Data logic |
| --- | --- |
| Investment value | Sum of filtered deposits, using the same sales query and filters as the Sales tab KPI. |
| Investment by day | Same filtered sales series as the Command Center trend: daily buckets for ranges up to 92 days and monthly buckets for longer ranges, grouped by the deposit date in Dhaka time (UTC+6) and zero-filled across the selected range. The full bar total is split into other payment methods and `reinvest` (stacked on top). It honors the selected deposit-status filter (approved by default) and shows only the current period. |

## Investors

| Display | Data logic |
| --- | --- |
| New registrations | Investors whose account creation timestamp falls in the selected date range, grouped in Dhaka time and zero-filled by day for ranges up to 92 days or by month for longer ranges. Columns split into investors with at least one approved deposit and those without one. The deposit may have occurred after registration; staff and deleted users are excluded. Other Investors-tab cards remain snapshots. |

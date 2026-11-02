# Air-raid alerts, Kyiv City: the history the KCMD gate is checked against

For `plans/plan-kcmd.md` (the alert gate, section 2, and step 1 of its order).

## Data

Vadimkin/ukrainian-air-raid-sirens-dataset (MIT), fetched 2026-11-02 13:47
(repo pushed 2026-11-02 05:05Z). The CSVs are gitignored here (40 MB):

```sh
cd research/ua-alerts
for f in official_data_en.csv volunteer_data_en.csv; do curl -sL -o $f https://raw.githubusercontent.com/Vadimkin/ukrainian-air-raid-sirens-dataset/main/datasets/$f; done
node kyiv.mjs
```

- `official_data_en.csv`: oblast, raion, hromada, level, started_at, finished_at. **Ends 2026-09-07**.
- `volunteer_data_en.csv` (alerts.in.ua side): region, started_at, finished_at, naive. Runs to the fetch day.

## MEASURED 2026-11-02, Kyiv City, exact duplicates removed, overlaps merged

| source, from 2025-01-01 | alerts | p50 | p90 | p95 | p99 | longest | hours under alert |
| --- | --- | --- | --- | --- | --- | --- | --- |
| official, to 2026-09-05 | 959 | 32 min | 198 | 289 | 489 | 673 | 1,145 |
| volunteer, to 2026-11-02 | 1,317 | 30 min | 78 | 115 | 226 | 852 | 863 |
| volunteer, 2026-09-07 to 11-02 | 243 | 30 min | 72 | 117 | 296 | 698 | 155 |

- The official row matches the plan's (959; p50 32, longest 673; p90 and p95 differ by one or two minutes from the percentile method).
- **The two sources disagree:** of 959 official alerts, 573 (60 %) have a volunteer alert starting within 2 minutes. The volunteer side has more, shorter alerts. The plan's rule "either source reporting an alert counts" takes the union, so the channel would be silent more often than either source alone says. Worth deciding with KCMD before the gate is built.
- **Load is rising:** volunteer, 2026, alerts per month and hours: Jan 68/36 h, Feb 46/29, Mar 51/29, Apr 45/23, May 69/37, Jun 52/23, Jul 74/49, Aug 97/44, **Sep 135/70, Oct 135/98**. In October the channel would have been silent about 13 % of the time.

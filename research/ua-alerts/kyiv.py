# python3 kyiv.py: Kyiv City alerts from both CSVs, duplicates removed, overlaps merged; the README's numbers.
import csv, datetime as dt
from collections import Counter
D = dt.datetime.fromisoformat
UTC = dt.timezone.utc

def load(f, key):
    rows = {(D(r['started_at']), D(r['finished_at'])) for r in csv.DictReader(open(f)) if r[key] == 'Kyiv City' and r['finished_at']}
    merged = []
    for s, e in sorted(rows):
        if merged and s <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], e)
        else: merged.append([s, e])
    return merged

def pct(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(p / 100 * len(xs)))]

def report(name, m, since):
    m = [x for x in m if x[0] >= since]
    d = [(e - s).total_seconds() / 60 for s, e in m]
    print(f"{name}: {len(m)} alerts {m[0][0]:%Y-%m-%d} to {m[-1][0]:%Y-%m-%d}, p50 {pct(d,50):.0f} p90 {pct(d,90):.0f} p95 {pct(d,95):.0f} p99 {pct(d,99):.0f} max {max(d):.0f} min, {sum(d)/60:.0f} h")

since = dt.datetime(2025, 1, 1, tzinfo=UTC)
off, vol = load('official_data_en.csv', 'oblast'), load('volunteer_data_en.csv', 'region')
report('official', off, since); report('volunteer', vol, since)
report('volunteer since official ends', vol, dt.datetime(2026, 9, 7, tzinfo=UTC))
c, h = Counter(), Counter()
for s, e in vol:
    if s.year == 2026: c[s.month] += 1; h[s.month] += (e - s).total_seconds() / 3600
print('2026 by month:', ' '.join(f"{k}:{c[k]}/{h[k]:.0f}h" for k in sorted(c)))
o = [x for x in off if x[0] >= since]; v = [x[0] for x in vol if since <= x[0] <= off[-1][0]]
print(f"official with a volunteer start within 2 min: {sum(1 for s, _ in o if any(abs((s - t).total_seconds()) <= 120 for t in v))} of {len(o)}")

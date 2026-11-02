# python3 days.py: Kyiv City, one character a day from 2022-02-24 (Kyiv time) to yesterday, 1 = an air-raid alert
# touched that day in either source, 0 = none. Writes demo/resources/ua-alerts/kyiv-days.json.
# The dataset starts 2022-02-25; sirens sounded in Kyiv on 2022-02-24, so day 1 is set to 1 by hand.
import csv, datetime as dt, json, os
from zoneinfo import ZoneInfo
K, D = ZoneInfo('Europe/Kyiv'), dt.datetime.fromisoformat
days = set()
for f, key in [('official_data_en.csv', 'oblast'), ('volunteer_data_en.csv', 'region')]:
    for r in csv.DictReader(open(f)):
        if r[key] != 'Kyiv City' or not r['finished_at']: continue
        s, e = D(r['started_at']).astimezone(K).date(), D(r['finished_at']).astimezone(K).date()
        while s <= e: days.add(s); s += dt.timedelta(1)
start, end = dt.date(2022, 2, 24), dt.datetime.now(K).date() - dt.timedelta(1)
bits = ''.join('1' if start + dt.timedelta(i) in days else '0' for i in range((end - start).days + 1))
bits = '1' + bits[1:]
out = '../../demo/resources/ua-alerts/kyiv-days.json'
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({ 'region': 'Kyiv City', 'tz': 'Europe/Kyiv', 'start': str(start), 'end': str(end), 'raid': '1', 'days': bits,
  'source': 'github.com/Vadimkin/ukrainian-air-raid-sirens-dataset, official and volunteer, MIT', 'made': str(dt.date.today()) }, open(out, 'w'))
print(out, len(bits), bits.count('1'), bits.count('0'))

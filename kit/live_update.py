import csv, json, sys, datetime, os
# usage: python3 live_update.py injuries.csv scores_raw.json weather.json stats_week.csv outdir
inj_csv, scores_raw, weather_in, stats_csv, out = sys.argv[1:6]
os.makedirs(out, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
FIX = {'JAC': 'JAX', 'LAR': 'LA', 'WSH': 'WAS'}
rows = list(csv.DictReader(open(inj_csv, newline='')))
wk = max(int(r['week']) for r in rows if r['season'] == '2026')
teams = {}
for r in rows:
    if r['season'] != '2026' or int(r['week']) != wk: continue
    s, ps = r['report_status'], r['practice_status']
    if not s:
        if 'Did Not' in ps: s = 'DNP'
        elif 'Limited' in ps: s = 'Limited'
        else: continue
    why = r['report_primary_injury'] or r['practice_primary_injury']
    if 'Not injury related' in why and s in ('DNP', 'Limited'): continue
    teams.setdefault(r['team'], []).append({'n': r['full_name'], 'p': r['position'], 's': s, 'i': why})
json.dump({'week': wk, 'teams': teams, 'updated': now}, open(f'{out}/injuries.json', 'w'))
raw = json.load(open(scores_raw))
games = {}
for g in raw.get('games', []):
    h, a = FIX.get(g['home'], g['home']), FIX.get(g['away'], g['away'])
    sc = g.get('score') or {}
    hs = sc.get(g['home'], sc.get(h)); as_ = sc.get(g['away'], sc.get(a))
    rec = {'status': g.get('status', 'scheduled'), 'start': g.get('start_time')}
    if hs is not None and as_ is not None: rec.update(hs=hs, **{'as': as_})
    for k in ('q', 'clock', 'plays'):
        if g.get(k) is not None: rec[k] = g[k]
    games[f'{a}@{h}'] = rec
json.dump({'games': games, 'updated': now}, open(f'{out}/scores.json', 'w'))
wx = json.load(open(weather_in)) if os.path.exists(weather_in) else {}
json.dump({'games': wx, 'updated': now}, open(f'{out}/weather.json', 'w'))
# official player stats for the latest week in the file
pl, pwk = {}, 0
if os.path.exists(stats_csv):
    srows = [r for r in csv.DictReader(open(stats_csv, newline='')) if r['season_type'] == 'REG' and r['position'] in ('QB', 'RB', 'WR', 'TE')]
    if srows:
        pwk = max(int(r['week']) for r in srows)
        f = lambda x: int(float(x)) if x not in ('', 'NA') else 0
        for r in srows:
            if int(r['week']) != pwk: continue
            pl[r['player_id']] = {'pass_': f(r['passing_yards']), 'rush': f(r['rushing_yards']), 'rec': f(r['receiving_yards']), 'recs': f(r['receptions']),
                                  'td': f(r['rushing_tds']) + f(r['receiving_tds']), 'ptd': f(r['passing_tds'])}
json.dump({'week': pwk, 'players': pl, 'updated': now}, open(f'{out}/players.json', 'w'))
json.dump({'updated': now, 'injuryWeek': wk, 'statsWeek': pwk, 'games': len(games)}, open(f'{out}/meta.json', 'w'))
print('injury week', wk, 'teams', len(teams), 'games', len(games), 'weather', len(wx), 'stats week', pwk, 'players', len(pl))

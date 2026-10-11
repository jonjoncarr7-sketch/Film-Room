# Builds live.json for the website without Claude. Runs on GitHub Actions.
# usage: python3 kit/live_action.py prev_live.json out_dir
# Scores + scoring plays: ESPN public scoreboard. Injuries + official stats: nflverse.
# Weather: Open-Meteo forecast at each outdoor home stadium (neutral sites keep the last forecast).
import json, sys, os, subprocess, urllib.request, datetime

prev_path, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (FilmRoom live data)'}
now = datetime.datetime.now(datetime.timezone.utc)


def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                b = r.read()
                return b if binary else json.loads(b)
        except Exception as e:
            err = e
    raise err


try:
    prev = json.load(open(prev_path))
except Exception:
    prev = {}

# ---------- scores ----------
STATUS = {'STATUS_SCHEDULED': 'scheduled', 'STATUS_IN_PROGRESS': 'inprogress', 'STATUS_END_PERIOD': 'inprogress',
          'STATUS_HALFTIME': 'halftime', 'STATUS_FINAL': 'closed', 'STATUS_FINAL_OVERTIME': 'closed',
          'STATUS_DELAYED': 'inprogress', 'STATUS_POSTPONED': 'postponed', 'STATUS_CANCELED': 'cancelled'}


def abbr(name):
    parts = [p for p in name.replace('.', ' ').split() if p.lower() not in ('jr', 'sr', 'ii', 'iii', 'iv', 'v')]
    return f'{parts[0][0]}.{parts[-1]}' if len(parts) >= 2 else name


import re
PASS = re.compile(r"^(.+?) \d+ Yd pass from (.+?)(?: \(|$)", re.I)
RUN = re.compile(r"^(.+?) \d+ Yd (?:Run|Rush)", re.I)


def plays_of(event_id):
    s = get(f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event_id}')
    out = []
    for sp in s.get('scoringPlays', []):
        t = sp.get('text', '')
        typ = ((sp.get('type') or {}).get('abbreviation') or '').upper()
        m = PASS.match(t)
        if m:
            out.append(f'TOUCHDOWN. {abbr(m.group(2))} pass to the end zone. Catch made by {abbr(m.group(1))}.')
            continue
        m = RUN.match(t)
        if m and (typ in ('TD', '') or 'Yd' in t):
            out.append(f'TOUCHDOWN. {abbr(m.group(1))} rushed into the end zone.')
            continue
        out.append(t)  # field goals, defensive scores: kept for reference, ignored by the page
    return out


games = []
neutral = {}
sb = get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')
for ev in sb.get('events', []):
    c = ev['competitions'][0]
    st = c.get('status') or ev.get('status') or {}
    status = STATUS.get(st.get('type', {}).get('name', ''), 'scheduled')
    teams = {x['homeAway']: x for x in c['competitors']}
    h, a = teams['home']['team']['abbreviation'], teams['away']['team']['abbreviation']
    g = {'status': status, 'start_time': ev.get('date'), 'home': h, 'away': a}
    if c.get('neutralSite'):
        neutral[(a, h)] = True
    if status != 'scheduled':
        g['score'] = {h: int(teams['home'].get('score') or 0), a: int(teams['away'].get('score') or 0)}
        g['q'] = st.get('period')
        g['clock'] = st.get('displayClock')
        try:
            g['plays'] = plays_of(ev['id'])
        except Exception as e:
            print('plays failed', a, h, e)
    games.append(g)
json.dump({'games': games}, open(f'{out}/scores_raw.json', 'w'))

# ---------- weather ----------
FIX = {'JAC': 'JAX', 'LAR': 'LA', 'WSH': 'WAS'}
OUT = {'BAL': (39.278, -76.623), 'BUF': (42.774, -78.787), 'CAR': (35.226, -80.853), 'CHI': (41.862, -87.617),
       'CIN': (39.095, -84.516), 'CLE': (41.506, -81.700), 'DEN': (39.744, -105.020), 'GB': (44.501, -88.062),
       'JAX': (30.324, -81.637), 'KC': (39.049, -94.484), 'MIA': (25.958, -80.239), 'NE': (42.091, -71.264),
       'NYG': (40.814, -74.074), 'NYJ': (40.814, -74.074), 'PHI': (39.901, -75.168), 'PIT': (40.447, -80.016),
       'SF': (37.403, -121.970), 'SEA': (47.595, -122.332), 'TB': (27.976, -82.503), 'TEN': (36.166, -86.771),
       'WAS': (38.908, -76.864)}
RETRACT = {'ARI', 'ATL', 'DAL', 'HOU', 'IND'}
DOME = {'DET', 'LV', 'LA', 'LAC', 'MIN', 'NO'}
wx = dict((prev.get('weather') or {}).get('games') or {})
for g in games:
    h, a = FIX.get(g['home'], g['home']), FIX.get(g['away'], g['away'])
    key = f'{a}@{h}'
    if g['status'] != 'scheduled' and key in wx:
        continue  # freeze the forecast once the game starts
    if (g['away'], g['home']) in neutral:
        continue  # international / neutral site: keep the last forecast
    if h in DOME:
        wx[key] = ['in', None, None, 'Dome.']
        continue
    if h in RETRACT:
        wx[key] = ['in', None, None, 'Retractable roof, usually closed.']
        continue
    if h not in OUT or not g.get('start_time'):
        continue
    try:
        ko = datetime.datetime.fromisoformat(g['start_time'].replace('Z', '+00:00'))
        if (ko - now).days > 6:
            continue
        lat, lon = OUT[h]
        f = get(f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}'
                '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,cloud_cover'
                '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&forecast_days=8')
        hr = f['hourly']
        stamp = ko.strftime('%Y-%m-%dT%H:00')
        if stamp not in hr['time']:
            continue
        i = hr['time'].index(stamp)
        span = range(i, min(i + 3, len(hr['time'])))
        temp = round(hr['temperature_2m'][i])
        rain = max((hr['precipitation_probability'][j] or 0) for j in span)
        wind = round(max((hr['wind_speed_10m'][j] or 0) for j in span))
        cloud = hr['cloud_cover'][i] or 0
        sky = 'Clear' if cloud < 25 else 'Partly cloudy' if cloud < 70 else 'Cloudy'
        rtxt = 'rain very likely' if rain >= 70 else 'rain likely' if rain >= 50 else 'chance of rain' if rain >= 25 else 'rain unlikely'
        wtxt = 'strong wind' if wind >= 18 else 'breezy' if wind >= 11 else 'light wind'
        wx[key] = ['out', temp, rain, f'{sky}, {wtxt} ({wind} mph), {rtxt}.']
    except Exception as e:
        print('weather failed', key, e)
json.dump(wx, open(f'{out}/weather.json', 'w'))

# ---------- injuries + official stats ----------
B = 'https://github.com/nflverse/nflverse-data/releases/download'
open(f'{out}/inj.csv', 'wb').write(get(f'{B}/injuries/injuries_2026.csv', binary=True))
open(f'{out}/stats.csv', 'wb').write(get(f'{B}/stats_player/stats_player_week_2026.csv', binary=True))

subprocess.run([sys.executable, f'{here}/live_update.py', f'{out}/inj.csv', f'{out}/scores_raw.json',
                f'{out}/weather.json', f'{out}/stats.csv', f'{out}/docs'], check=True)
live = {k: json.load(open(f'{out}/docs/{k}.json')) for k in ['scores', 'injuries', 'weather', 'players', 'meta']}
live['meta']['source'] = 'github-actions'
json.dump(live, open(f'{out}/live.json', 'w'), separators=(',', ':'))


# changed? (ignore the "updated" stamps)
def strip(d):
    if isinstance(d, dict):
        return {k: strip(v) for k, v in d.items() if k not in ('updated', 'source')}
    return d


changed = strip(live) != strip(prev)
open(f'{out}/changed', 'w').write('yes' if changed else 'no')
print('games', len(games), 'live/final', sum(g['status'] != 'scheduled' for g in games),
      'weather', len(wx), 'changed', changed)

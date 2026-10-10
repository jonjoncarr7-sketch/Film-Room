"""Build Film Room data JSON from nflverse files (2025 + 2026 seasons)."""
import csv, gzip, json, math, os, datetime
from collections import defaultdict, Counter

def rows(f):
    op = gzip.open if f.endswith('.gz') else open
    with op(f, 'rt', newline='') as fh:
        yield from csv.DictReader(fh)

num = lambda x: float(x) if x not in ('', 'NA', None) else 0.0

# ---------------- games ----------------
G = {}
for r in rows('games.csv'):
    if int(r['season']) >= 2015:
        G[r['game_id']] = r
def margin(gid, team):
    g = G.get(gid)
    if not g or g['result'] == '': return None
    hs, a = int(g['home_score']), int(g['away_score'])
    return hs - a if team == g['home_team'] else a - hs
POSTW = {'WC': 19, 'DIV': 20, 'CON': 21, 'SB': 22}

# ---------------- team ratings per season ----------------
def team_ratings(season):
    tw = [r for r in rows(f'stats_team_week_{season}.csv') if r['season_type'] == 'REG']
    by_game = defaultdict(dict)
    for r in tw: by_game[r['game_id']][r['team']] = r
    agg = defaultdict(lambda: defaultdict(float))
    for gid, d in by_game.items():
        if len(d) != 2 or gid not in G or G[gid]['result'] == '': continue
        a, b = list(d)
        for t, o in ((a, b), (b, a)):
            R, O, A = d[t], d[o], agg[t]
            A['g'] += 1
            A['passY'] += num(R['passing_yards']); A['rushY'] += num(R['rushing_yards'])
            A['passA'] += num(O['passing_yards']); A['rushA'] += num(O['rushing_yards'])
            A['dropbacks'] += num(R['attempts']) + num(R['sacks_suffered']); A['sacked'] += num(R['sacks_suffered'])
            A['oppDrop'] += num(O['attempts']) + num(O['sacks_suffered']); A['sacks'] += num(R['def_sacks'])
            give = num(R['passing_interceptions']) + num(R['sack_fumbles_lost']) + num(R['rushing_fumbles_lost']) + num(R['receiving_fumbles_lost'])
            take = num(O['passing_interceptions']) + num(O['sack_fumbles_lost']) + num(O['rushing_fumbles_lost']) + num(O['receiving_fumbles_lost'])
            A['to'] += take - give
            m = margin(gid, t)
            g = G[gid]; pf = int(g['home_score']) if t == g['home_team'] else int(g['away_score'])
            A['pf'] += pf; A['pa'] += pf - m
            A['w'] += m > 0; A['l'] += m < 0; A['t'] += m == 0
    T = {}
    for t, A in agg.items():
        n = A['g']
        T[t] = dict(g=int(n), ppg=round(A['pf']/n, 1), papg=round(A['pa']/n, 1), passY=round(A['passY']/n), rushY=round(A['rushY']/n),
                    passA=round(A['passA']/n), rushA=round(A['rushA']/n), sackRate=round(100*A['sacks']/max(A['oppDrop'], 1), 1),
                    sackedRate=round(100*A['sacked']/max(A['dropbacks'], 1), 1), to=int(A['to']), w=int(A['w']), l=int(A['l']), t=int(A['t']))
    def rank(key, high_good):
        order = sorted(T, key=lambda t: T[t][key], reverse=high_good)
        for i, t in enumerate(order): T[t][key + 'Rk'] = i + 1
    for k, hg in [('ppg', 1), ('papg', 0), ('passY', 1), ('rushY', 1), ('passA', 0), ('rushA', 0), ('sackRate', 1), ('sackedRate', 0), ('to', 1)]:
        rank(k, hg)
    return T
TR = {'2025': team_ratings('2025'), '2026': team_ratings('2026')}

# ---------------- 2025 coverage charting ----------------
pbp25 = {}
for r in rows('play_by_play_2025.csv.gz'):
    if r['play_type'] in ('pass', 'run'):
        pbp25[(r['game_id'], r['play_id'])] = (r['defteam'], r['play_type'], r['receiver_player_id'], r['passer_player_id'], r['rusher_player_id'],
                                               r['complete_pass'] == '1', num(r['receiving_yards']), num(r['passing_yards']), num(r['rushing_yards']),
                                               r['pass_attempt'] == '1' and r['sack'] != '1', r['interception'] == '1', r['sack'] == '1')
COVN = {'COVER_0': 'Cover 0', 'COVER_1': 'Cover 1', 'COVER_2': 'Cover 2', '2_MAN': '2-Man', 'COVER_3': 'Cover 3', 'COVER_4': 'Cover 4', 'COVER_6': 'Cover 6', 'COVER_9': 'Cover 9'}
defcov = defaultdict(Counter); defman = defaultdict(Counter); defpress = defaultdict(Counter)
gamecov = defaultdict(Counter); gameman = defaultdict(Counter)
rec_cov = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))   # tgt, rec, yds
qb_cov = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))   # att, cmp, yds, int
qb_press = defaultdict(lambda: {'p': [0, 0, 0], 'c': [0, 0, 0]})  # att, yds, sacks
rb_box = defaultdict(lambda: defaultdict(lambda: [0, 0]))          # car, yds
for r in rows('pbp_participation_2025.csv'):
    k = (r['nflverse_game_id'], r['play_id'])
    if k not in pbp25: continue
    dt, pt, rec, qb, rb, comp, ryds, pyds, ruy, att, inter, sack = pbp25[k]
    cov = COVN.get(r['defense_coverage_type']); mz = r['defense_man_zone_type']
    if pt == 'pass':
        if cov:
            defcov[dt][cov] += 1; gamecov[(k[0], dt)][cov] += 1
        if mz in ('MAN_COVERAGE', 'ZONE_COVERAGE'):
            defman[dt][mz] += 1; gameman[(k[0], dt)][mz] += 1
        if r['was_pressure'] in ('TRUE', 'FALSE'): defpress[dt][r['was_pressure']] += 1
        if att and cov:
            if rec:
                a = rec_cov[rec][cov]; a[0] += 1; a[1] += comp; a[2] += ryds
                b = rec_cov[rec]['MAN' if mz == 'MAN_COVERAGE' else 'ZONE' if mz == 'ZONE_COVERAGE' else '?']; b[0] += 1; b[1] += comp; b[2] += ryds
            if qb:
                a = qb_cov[qb][cov]; a[0] += 1; a[1] += comp; a[2] += pyds; a[3] += inter
                b = qb_cov[qb]['MAN' if mz == 'MAN_COVERAGE' else 'ZONE' if mz == 'ZONE_COVERAGE' else '?']; b[0] += 1; b[1] += comp; b[2] += pyds; b[3] += inter
        if qb and r['was_pressure'] in ('TRUE', 'FALSE'):
            q = qb_press[qb]['p' if r['was_pressure'] == 'TRUE' else 'c']
            if att: q[0] += 1; q[1] += pyds
            if sack: q[2] += 1
    elif pt == 'run' and rb and r['defenders_in_box'] not in ('', '0'):
        box = int(r['defenders_in_box']); bk = 'light' if box <= 6 else 'normal' if box == 7 else 'stacked'
        a = rb_box[rb][bk]; a[0] += 1; a[1] += ruy
def tendency(t):
    c = defcov[t]; m = defman[t]; tot = sum(c.values()) or 1
    return dict(man=round(100*m['MAN_COVERAGE']/max(sum(m.values()), 1)), mix=[[k, round(100*v/tot)] for k, v in c.most_common(4)],
                press=round(100*defpress[t]['TRUE']/max(sum(defpress[t].values()), 1)))
TEND = {t: tendency(t) for t in defcov}
# pressure-rate rank 2025
for t, d in TEND.items(): pass
prk = sorted(TEND, key=lambda t: -TEND[t]['press'])
for i, t in enumerate(prk): TEND[t]['pressRk'] = i + 1

# ---------------- red zone usage ----------------
RZ = defaultdict(lambda: [0, 0])  # (gid,pid) -> [rz touches, goal-line carries]
for f in ('play_by_play_2025.csv.gz', 'play_by_play_2026.csv.gz'):
    for r in rows(f):
        if r['play_type'] not in ('pass', 'run') or r['yardline_100'] in ('', 'NA'): continue
        y = float(r['yardline_100'])
        if y > 20: continue
        if r['play_type'] == 'run' and r['rusher_player_id']:
            a = RZ[(r['game_id'], r['rusher_player_id'])]; a[0] += 1; a[1] += y <= 5
        elif r['receiver_player_id'] and r['pass_attempt'] == '1':
            RZ[(r['game_id'], r['receiver_player_id'])][0] += 1

# ---------------- player stats ----------------
pfr = {r['gsis_id']: r['pfr_id'] for r in rows('players.csv') if r['pfr_id']}
snaps = {}
for s in ('2025', '2026'):
    for r in rows(f'snap_counts_{s}.csv'):
        snaps[(r['game_id'], r['pfr_player_id'])] = round(num(r['offense_pct'])*100)
PW = defaultdict(list)
for s in ('2025', '2026'):
    for r in rows(f'stats_player_week_{s}.csv'):
        if r['position'] in ('QB', 'RB', 'WR', 'TE') and r['game_id'] in G:
            PW[r['player_id']].append(r)
for k in PW: PW[k].sort(key=lambda r: (r['season'], int(r['week'])))

# choose players from 2026 usage
cur = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))  # team -> pid -> metric
last_game_att = defaultdict(dict)
info = {}
for pid, lst in PW.items():
    for r in lst:
        if r['season'] != '2026': continue
        t = r['team']; c = cur[t][pid]
        c['att'] += num(r['attempts']); c['car'] += num(r['carries']); c['tgt'] += num(r['targets']); c['g'] += 1
        c['wk'] = max(c['wk'], int(r['week']))
        info[pid] = (r['player_display_name'], r['position'], t)
SEL = {}
for t, d in cur.items():
    lastwk = max(c['wk'] for c in d.values())
    qbs = [p for p in d if info[p][1] == 'QB' and info[p][2] == t]
    if qbs:
        recent = [p for p in qbs if d[p]['wk'] == lastwk] or qbs
        SEL[max(recent, key=lambda p: (d[p]['wk'], d[p]['att']))] = t
    rbs = sorted([p for p in d if info[p][1] == 'RB' and info[p][2] == t], key=lambda p: -d[p]['car'])
    for i, p in enumerate(rbs[:2]):
        if i == 0 or d[p]['car'] >= 25: SEL[p] = t
    wrs = sorted([p for p in d if info[p][1] == 'WR' and info[p][2] == t], key=lambda p: -d[p]['tgt'])
    for p in wrs[:3]:
        if d[p]['tgt'] >= 6: SEL[p] = t
    tes = sorted([p for p in d if info[p][1] == 'TE' and info[p][2] == t], key=lambda p: -d[p]['tgt'])
    for p in tes[:1]:
        if d[p]['tgt'] >= 6: SEL[p] = t

def wk_label(r):
    w = int(r['week'])
    if r['season_type'] == 'POST':
        g = G[r['game_id']]['game_type']; return {'WC': 'Wild Card', 'DIV': 'Divisional', 'CON': 'Conf. title', 'SB': 'Super Bowl'}.get(g, 'Playoffs')
    return f'Week {w}'

def mate_of(pid):
    t = SEL[pid]; pos = info[pid][1]
    rec = sorted([p for p in SEL if SEL[p] == t and info[p][1] in ('WR', 'TE')], key=lambda p: -cur[t][p]['tgt'])
    rbs = [p for p in SEL if SEL[p] == t and info[p][1] == 'RB' and p != pid]
    if pos == 'QB': return rec[0] if rec else None
    if pos in ('WR', 'TE'):
        o = [p for p in rec if p != pid]; return o[0] if o else None
    return rbs[0] if rbs else (rec[0] if rec else None)

OLD = defaultdict(list)
for s_ in ('2022', '2023', '2024'):
    for r in rows(f'stats_player_week_{s_}.csv'):
        if r['position'] in ('QB', 'RB', 'WR', 'TE'): OLD[r['player_id']].append(r)
sched_all = sorted([g for g in G.values() if g['season'] == '2026'], key=lambda g: (int(g['week']), g['gameday']))
def next_opp(t):
    for g in sched_all:
        if g['result'] == '' and t in (g['home_team'], g['away_team']):
            return g['away_team'] if g['home_team'] == t else g['home_team']
def h2h(pid, opp):
    out = []
    for r in OLD.get(pid, []) + PW.get(pid, []):
        if r['opponent_team'] != opp or r['game_id'] not in G: continue
        out.append(dict(s=r['season'][2:], w=wk_label(r), h=G[r['game_id']]['home_team'] == r['team'], t=r['team'], m=margin(r['game_id'], r['team']),
                        pass_=int(num(r['passing_yards'])), rush=int(num(r['rushing_yards'])), rec=int(num(r['receiving_yards'])), recs=int(num(r['receptions'])),
                        td=int(num(r['rushing_tds']) + num(r['receiving_tds'])), ptd=int(num(r['passing_tds']))))
    wn = lambda w: int(w.split()[-1]) if w.startswith('Week') else {'Wild Card': 19, 'Divisional': 20, 'Conf. title': 21, 'Super Bowl': 22}.get(w, 23)
    return sorted(out, key=lambda x: (x['s'], wn(x['w'])))
PL = []
for pid, t in SEL.items():
    name, pos, _ = info[pid]
    lst = [r for r in PW[pid]][-20:]
    mate = mate_of(pid)
    mate_games = {r['game_id'] for r in PW.get(mate, [])}
    mate_team_seasons = {(r['season'], r['team']) for r in PW.get(mate, [])}
    log = []
    for r in lst:
        gid, s, opp = r['game_id'], r['season'], r['opponent_team']
        tr = TR[s].get(opp, {})
        gc = gamecov.get((gid, opp)); gm = gameman.get((gid, opp))
        log.append(dict(
            s=s[2:], w=wk_label(r), o=opp, h=G[gid]['home_team'] == r['team'], t=r['team'], m=margin(gid, r['team']),
            pass_=int(num(r['passing_yards'])), rush=int(num(r['rushing_yards'])), rec=int(num(r['receiving_yards'])), recs=int(num(r['receptions'])),
            att=int(num(r['attempts'])), car=int(num(r['carries'])), tgt=int(num(r['targets'])),
            snap=snaps.get((gid, pfr.get(pid, '')), None),
            td=int(num(r['rushing_tds']) + num(r['receiving_tds'])), ptd=int(num(r['passing_tds'])),
            rz=RZ[(gid, pid)][0], gl=RZ[(gid, pid)][1], tr=tr.get('papgRk'), pts=tr.get('papg'),
            pr=tr.get('passARk'), rr=tr.get('rushARk'), kr=tr.get('sackRateRk'), pa=tr.get('passA'), ra=tr.get('rushA'),
            cov=gc.most_common(1)[0][0] if gc else None,
            man=round(100*gm['MAN_COVERAGE']/sum(gm.values())) if gm else None,
            mate=bool(mate) and (s, r['team']) in mate_team_seasons and gid not in mate_games))
    stats = {'QB': ['pass', 'rush', 'ptd'], 'RB': ['rush', 'rec', 'recs', 'td'], 'WR': ['rec', 'recs', 'td'], 'TE': ['rec', 'recs', 'td']}[pos]
    cov = None
    if pos in ('WR', 'TE', 'RB') and pid in rec_cov:
        cov = {k: v for k, v in rec_cov[pid].items() if v[0] > 0}
    elif pos == 'QB' and pid in qb_cov:
        cov = {k: v for k, v in qb_cov[pid].items() if v[0] > 0}
    PL.append(dict(id=pid, name=name, pos=pos, team=t, stats=stats, log=log, cov=cov, h2h=h2h(pid, next_opp(t)), h2hOpp=next_opp(t),
                   press=qb_press.get(pid) if pos == 'QB' else None,
                   box={k: v for k, v in rb_box[pid].items()} if pos == 'RB' and pid in rb_box else None,
                   mate=info[mate][0] if mate else None, matePos=info[mate][1] if mate else None,
                   share=round(cur[t][pid]['tgt']/max(sum(cur[t][p]['tgt'] for p in cur[t]), 1)*100) if pos in ('WR', 'TE', 'RB') else None,
                   cshare=round(cur[t][pid]['car']/max(sum(cur[t][p]['car'] for p in cur[t]), 1)*100) if pos == 'RB' else None))

# ---------------- schedule, next games, form ----------------
sched26 = sorted([g for g in G.values() if g['season'] == '2026'], key=lambda g: (int(g['week']), g['gameday'], g['gametime']))
def next_game(t):
    for g in sched26:
        if g['result'] == '' and t in (g['home_team'], g['away_team']): return g['game_id']
WX = json.load(open('weather.json')) if os.path.exists('weather.json') else {}  # optional {"AWAY@HOME": [...]} forecast
CUR = str(min(int(g['week']) for g in sched26 if g['result'] == '' and g['game_type'] == 'REG'))
def ml_prob(a, h):
    def p(ml): ml = float(ml); return 100/(ml+100) if ml > 0 else -ml/(-ml+100)
    if not a or not h: return 0.5
    pa, ph = p(a), p(h); return ph/(pa+ph)
W5 = []
for g in sched26:
    if g['week'] != CUR: continue
    a, h = g['away_team'], g['home_team']
    key = f'{a}@{h}'
    sp, tot = num(g['spread_line']), num(g['total_line']) or 44.0
    W5.append(dict(id=g['game_id'], away=a, home=h, day=g['weekday'], date=g['gameday'], time=g['gametime'], stadium=g['stadium'],
                   roof=g['roof'], surface=g['surface'], spread=sp, total=tot, aml=g['away_moneyline'], hml=g['home_moneyline'],
                   pHome=round(ml_prob(g['away_moneyline'], g['home_moneyline']), 3),
                   final=[int(g['away_score']), int(g['home_score'])] if g['result'] != '' else None,
                   wx=WX.get(key)))
for gm in W5:
    a, h = gm['away'], gm['home']
    past = sorted([x for x in G.values() if x['result'] != '' and {x['home_team'], x['away_team']} == {a, h} and x['game_id'] != gm['id']],
                  key=lambda x: (x['season'], int(x['week'])))[-5:]
    gm['meet'] = [dict(s=x['season'], w=x['week'], gt=x['game_type'], away=x['away_team'], home=x['home_team'], as_=int(x['away_score']), hs=int(x['home_score'])) for x in past]
NEXT = {t: next_game(t) for t in TR['2026']}
NEXTG = {}
for t, gid in NEXT.items():
    if not gid: continue
    g = G[gid]; NEXTG[gid] = dict(id=gid, week=int(g['week']), away=g['away_team'], home=g['home_team'], day=g['weekday'], date=g['gameday'], time=g['gametime'],
                                   spread=num(g['spread_line']) if g['spread_line'] else None, total=num(g['total_line']) if g['total_line'] else None,
                                   pHome=round(ml_prob(g['away_moneyline'], g['home_moneyline']), 3) if g['away_moneyline'] else None)
FORM = {}
for t in TR['2026']:
    gs = sorted([x for x in G.values() if x['result'] != '' and t in (x['home_team'], x['away_team'])], key=lambda x: (x['season'], int(x['week'])))[-5:]
    FORM[t] = [dict(s=x['season'][2:], w=int(x['week']), o=x['away_team'] if x['home_team'] == t else x['home_team'], h=x['home_team'] == t, m=margin(x['game_id'], t),
                    pf=int(x['home_score']) if x['home_team'] == t else int(x['away_score'])) for x in gs]

# ---------------- injuries (week 5) ----------------
ORD = {'Out': 0, 'Doubtful': 1, 'Questionable': 2, 'DNP': 3, 'Limited': 4}
key_ids = set(SEL)
INJ = defaultdict(list)
for r in rows('injuries_2026.csv'):
    if r['week'] != CUR: continue
    st = r['report_status']
    ps = r['practice_status']
    if not st:
        if 'Did Not' in ps: st = 'DNP'
        elif 'Limited' in ps: st = 'Limited'
        else: continue
    why = r['report_primary_injury'] or r['practice_primary_injury']
    if 'Not injury related' in why and st in ('DNP', 'Limited'): continue
    INJ[r['team']].append(dict(n=r['full_name'], p=r['position'], s=st, i=why, k=r['gsis_id'] in key_ids))
for t in INJ: INJ[t].sort(key=lambda x: (ORD[x['s']], not x['k'], x['p'] not in ('QB', 'WR', 'RB', 'TE', 'T', 'CB', 'DE', 'S')))

NAMES = {'ARI': 'Cardinals', 'ATL': 'Falcons', 'BAL': 'Ravens', 'BUF': 'Bills', 'CAR': 'Panthers', 'CHI': 'Bears', 'CIN': 'Bengals', 'CLE': 'Browns', 'DAL': 'Cowboys', 'DEN': 'Broncos',
         'DET': 'Lions', 'GB': 'Packers', 'HOU': 'Texans', 'IND': 'Colts', 'JAX': 'Jaguars', 'KC': 'Chiefs', 'LV': 'Raiders', 'LAC': 'Chargers', 'LA': 'Rams', 'MIA': 'Dolphins',
         'MIN': 'Vikings', 'NE': 'Patriots', 'NO': 'Saints', 'NYG': 'Giants', 'NYJ': 'Jets', 'PHI': 'Eagles', 'PIT': 'Steelers', 'SF': '49ers', 'SEA': 'Seahawks', 'TB': 'Buccaneers',
         'TEN': 'Titans', 'WAS': 'Commanders'}
out = dict(asof=datetime.date.today().isoformat(), week=int(CUR), names=NAMES, tr=TR['2026'], tend=TEND, players=PL, w5=W5, next=NEXT, nextg=NEXTG, form=FORM, inj=INJ,
           bye=sorted(set(NAMES) - {g['away'] for g in W5} - {g['home'] for g in W5}))
s = json.dumps(out, separators=(',', ':'))
open('film.json', 'w').write(s)
print('players', len(PL), 'bytes', len(s))
print('w5', [(g['away'], g['home'], g['spread'], g['pHome'], g['final']) for g in W5])

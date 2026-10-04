#!/usr/bin/env python3
"""League leaderboard aggregator for MOREHOUSE MORE PROBLEMS.
Players' browsers POST score JSON to a public ntfy.sh topic (no login, CORS open, 12h retention).
This script (run by GitHub Actions every ~10 min, best effort) pulls the topic, validates every entry with the
same rules the game uses, applies per-device rate limits + the manual blocklist, and writes
scores/leaderboard.json (top 200 kept, game shows top 25)."""
import json, os, re, time, urllib.request
TOPIC = os.environ.get('LB_TOPIC', 'mmp-league-scores-k7q2v9x4')
D = os.path.dirname(os.path.abspath(__file__))
OUT, BLOCK = f'{D}/leaderboard.json', f'{D}/blocklist.json'
NAME_RE = re.compile(r"^[A-Za-z0-9 .,!?'&_#*$@+-]{1,16}$")
ID_RE = re.compile(r'^[a-z0-9]{8,16}$')
MAX_PER_DEV_HOUR = 12

def valid(e):
    try:
        if e.get('v') != 1: return False
        n, s, t, d, b, p = e['n'], e['s'], e['t'], e['d'], e['b'], e['p']
        if not isinstance(n, str) or not NAME_RE.match(n) or not n.strip(): return False
        if not ID_RE.match(str(e.get('id', ''))) or not ID_RE.match(str(e.get('dev', ''))): return False
        if e.get('m') not in ('rookie', 'y5'): return False
        for x in (s, t, d, b, p):
            if not isinstance(x, int) or x < 0: return False
        if s <= 0 or s > 3_000_000: return False            # hard score cap
        if d < 8 or d > 4 * 3600: return False               # seconds actually played
        if t > 80 or t > d // 6 + 1: return False            # a track takes real time
        if b > t // 5 + 1: return False                      # bosses need tracks
        if p > d * 8 + 20: return False                      # problems/sec sanity
        if s > 2500 * d + 7500 * b * (b + 1) + 2500 * (b + 1) * (b + 2) + 6000 * (t + 1): return False   # points/sec vs duration (+boss/mini-boss bonuses)
        return True
    except Exception:
        return False

def clean(e, ts):
    return {k: e[k] for k in ('id', 'n', 's', 't', 'm', 'p', 'd', 'b', 'dev')} | {'ts': int(ts)}

def collapse(entries):
    """One entry per device+name (the max score, earliest on ties), and the same device+score is never listed
    twice. Clients re-post their personal best (same id) on load, so duplicates are expected and harmless."""
    best, seen = {}, set()
    for e in sorted(entries, key=lambda e: (-e['s'], e['ts'])):
        k, ks = (e['dev'], e['n'].strip().lower()), (e['dev'], e['s'])
        if k in best or ks in seen: continue
        best[k] = e; seen.add(ks)
    return sorted(best.values(), key=lambda e: (-e['s'], e['ts']))

def main():
    old = {'top': []}
    try: old = json.load(open(OUT))
    except Exception: pass
    blocked = set()
    try: blocked = set(json.load(open(BLOCK)).get('ids', []))
    except Exception: pass
    req = urllib.request.Request(f'https://ntfy.sh/{TOPIC}/json?poll=1&since=all', headers={'User-Agent': 'mmp-leaderboard'})
    raw = urllib.request.urlopen(req, timeout=30).read().decode()
    incoming = []
    for line in raw.splitlines():
        try:
            m = json.loads(line)
            if m.get('event') != 'message': continue
            e = json.loads(m.get('message', ''))
            if valid(e): incoming.append(clean(e, m.get('time', time.time())))
        except Exception: continue
    have = {e['id']: e for e in old.get('top', []) if valid(dict(e, v=1))}
    incoming.sort(key=lambda e: e['ts'])
    for e in incoming:
        if e['id'] in have: continue
        recent = [x for x in have.values() if x['dev'] == e['dev'] and abs(x['ts'] - e['ts']) < 3600]
        if len(recent) >= MAX_PER_DEV_HOUR: continue          # per-device rate limit
        have[e['id']] = e
    top = collapse(e for e in have.values() if e['id'] not in blocked)[:200]
    new = {'v': 1, 'topic': TOPIC, 'count': len(top), 'blocked': sorted(blocked), 'top': top}
    if json.dumps({k: v for k, v in old.items() if k != 'updated'}, sort_keys=True) != json.dumps(new, sort_keys=True):
        new['updated'] = int(time.time())
        json.dump(new, open(OUT, 'w'), separators=(',', ':'))
        print('updated', len(top), 'entries')
    else:
        print('no change', len(top))

if __name__ == '__main__':
    main()

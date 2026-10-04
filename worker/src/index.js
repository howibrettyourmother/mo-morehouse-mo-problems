// MOREHOUSE MORE PROBLEMS: league leaderboard Worker (Cloudflare free tier, one KV namespace).
// KV layout (kept tiny so we stay far inside the free 1,000 writes/day):
//   board:<main|test>         one JSON doc {v,top:[...],blocked:[...],updated}; written only when a score actually changes the board
//   rl:d:<dev>:<hour>         per-device counter (TTL ~1h), written only alongside a board write
//   rl:i:<sha(ip)>:<hour>     per-IP counter (TTL ~1h), same
// Re-posting a score that is already on the board (clients re-post their personal best on load) costs 0 writes.
const NAME_RE = /^[A-Za-z0-9 .,!?'&_#*$@+-]{1,16}$/, ID_RE = /^[a-z0-9]{8,16}$/;
const MAX_KEEP = 500, MAX_DEV_HOUR = 12, MAX_IP_HOUR = 40, BOARDS = new Set(['main', 'test']);

export function valid(e) {
  try {
    if (!e || e.v !== 1) return false;
    const { n, s, t, d, b, p } = e;
    if (typeof n !== 'string' || !NAME_RE.test(n) || !n.trim()) return false;
    if (!ID_RE.test(String(e.id || '')) || !ID_RE.test(String(e.dev || ''))) return false;
    if (e.m !== 'rookie' && e.m !== 'y5') return false;
    for (const x of [s, t, d, b, p]) if (!Number.isInteger(x) || x < 0) return false;
    if (s <= 0 || s > 3_000_000) return false;                 // hard score cap
    if (d < 8 || d > 4 * 3600) return false;                    // seconds actually played
    if (t > 80 || t > Math.floor(d / 6) + 1) return false;      // a track takes real time
    if (b > Math.floor(t / 5) + 1) return false;                // bosses need tracks
    if (p > d * 8 + 20) return false;                           // problems/sec sanity
    return s <= 2500 * d + 7500 * b * (b + 1) + 2500 * (b + 1) * (b + 2) + 6000 * (t + 1);   // points/sec vs duration
  } catch { return false }
}
const clean = (e, ts) => ({ id: e.id, n: e.n.trim(), s: e.s, t: e.t, m: e.m, p: e.p, d: e.d, b: e.b, dev: e.dev, ts });
const key = e => e.dev + '|' + e.n.trim().toLowerCase();
// one entry per device+name (max score, earliest on ties); never the same device+score twice
export function collapse(list) {
  const best = new Set(), seen = new Set(), out = [];
  for (const e of [...list].sort((a, b) => b.s - a.s || a.ts - b.ts)) {
    const k = key(e), ks = e.dev + '|' + e.s;
    if (best.has(k) || seen.has(ks)) continue;
    best.add(k); seen.add(ks); out.push(e);
  }
  return out.slice(0, MAX_KEEP);
}
// decide what a POST does to the board: {board, changed, reason}
export function apply(doc, e) {
  const top = doc.top || [], blocked = new Set(doc.blocked || []);
  if (blocked.has(e.id)) return { changed: false, reason: 'blocked' };
  if (top.some(x => x.id === e.id)) return { changed: false, reason: 'dup' };
  const mine = top.find(x => key(x) === key(e));
  if (mine && mine.s >= e.s) return { changed: false, reason: 'not-best' };
  if (top.some(x => x.dev === e.dev && x.s === e.s)) return { changed: false, reason: 'dup' };
  const next = collapse(top.filter(x => x !== mine).concat([e]));
  if (!next.some(x => x.id === e.id)) return { changed: false, reason: 'below-cut' };
  return { changed: true, top: next, reason: 'ok' };
}
// ---- WEEKLY SEASON: weeks run Tuesday 4:00am America/New_York -> next Tuesday 4:00am (DST-aware), computed from the timestamp (no cron) ----
const NYF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function nyWall(ms) { const p = Object.fromEntries(NYF.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) }
const wallToUtc = w => { let u = w + 4 * 3600e3; for (let i = 0; i < 3; i++) u = w - (nyWall(u) - u); return u };   // invert the NY offset (2 fixed-point steps settle DST)
export function weekOf(ms) {
  const w = nyWall(ms) - 4 * 3600e3, d = new Date(w), back = (d.getUTCDay() - 2 + 7) % 7;
  const startWall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) + 4 * 3600e3, endWall = startWall + 7 * 86400e3;
  return { key: new Date(startWall).toISOString().slice(0, 10), start: wallToUtc(startWall), end: wallToUtc(endWall) };
}
const prevKey = k => new Date(Date.parse(k + 'T12:00:00Z') - 7 * 86400e3).toISOString().slice(0, 10);
const WEEK_TTL = 120 * 86400;   // weekly docs clean themselves up after ~4 months (the #1 lives on in the Hall of Shame)
const view = (top, mode, limit) => (mode === 'all' ? top : top.filter(e => e.m === mode)).slice(0, limit);
const rankOf = (top, id, mode) => { const l = mode === 'all' ? top : top.filter(e => e.m === mode); const i = l.findIndex(e => e.id === id); return i < 0 ? 0 : i + 1 };

async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('') }
function cors(req, env) {
  const o = req.headers.get('Origin') || '', ok = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (ok.includes(o)) Object.assign(h, { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
  return { h, allowed: ok.includes(o), origin: o };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status: status || 200, headers: h });

const EMPTY = () => ({ v: 1, top: [], blocked: [] });
async function hallView(env, P, hos, wk, blocked) {
  const list = [...(hos.list || [])];
  if (hos.cur && hos.cur !== wk.key && !list.some(x => x.week === hos.cur)) {          // last active week finished but nobody posted since: show its #1 without a write
    const d = await env.MMP_SCORES.get(`week:${P}${hos.cur}`, { type: 'json' });
    const w1 = d && (d.top || []).find(e => !blocked.has(e.id));
    if (w1) list.push({ week: hos.cur, ...w1 });
  }
  return list.filter(x => !blocked.has(x.id)).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 52);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), c = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: c.allowed ? 204 : 403, headers: c.h });
    if (url.pathname === '/') return json({ ok: true, service: 'morehouse-scores', endpoints: ['GET /scores?period=all|week&mode=all|y5|rookie&limit=25', 'POST /scores'] }, 200, c.h);
    if (url.pathname !== '/scores') return json({ ok: false, error: 'not found' }, 404, c.h);
    const board = BOARDS.has(url.searchParams.get('board')) ? url.searchParams.get('board') : 'main', P = board === 'test' ? 'test:' : '';
    const KM = 'board:' + board, KH = 'hos:' + board;
    const mode = ['all', 'y5', 'rookie'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'all';
    const period = url.searchParams.get('period') === 'week' ? 'week' : 'all';
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '25', 10) || 25));
    const nowQ = +url.searchParams.get('now'), now = board === 'test' && nowQ > 1.6e12 ? nowQ : Date.now();   // time travel only on the test board
    const wk = weekOf(now), KW = `week:${P}${wk.key}`, weekInfo = { key: wk.key, start: wk.start, end: wk.end };
    const get = k => env.MMP_SCORES.get(k, { type: 'json' });
    if (req.method === 'GET') {
      const [doc, wdoc, hos] = await Promise.all([get(KM), get(KW), get(KH)]).then(a => [a[0] || EMPTY(), a[1] || EMPTY(), a[2] || { list: [] }]);
      const blocked = new Set(doc.blocked || []), src = period === 'week' ? wdoc.top || [] : doc.top || [];
      return json({ ok: true, v: 1, board, mode, period, week: weekInfo, count: src.length, updated: doc.updated || 0, blocked: [...blocked],
        top: view(src.filter(e => !blocked.has(e.id)), mode, limit), weekTop: period === 'all' ? view((wdoc.top || []).filter(e => !blocked.has(e.id)), mode, limit) : undefined,
        hallOfShame: await hallView(env, P, hos, wk, blocked) }, 200, c.h);
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405, c.h);
    if (!c.allowed) return json({ ok: false, error: 'origin not allowed' }, 403, c.h);
    let e; try { const txt = await req.text(); if (txt.length > 2000) throw 0; e = JSON.parse(txt) } catch { return json({ ok: false, error: 'bad json' }, 400, c.h) }
    if (!valid(e)) return json({ ok: false, error: 'invalid score' }, 422, c.h);
    const ent = clean(e, Math.floor(now / 1000));
    const [doc, wdoc, hos] = await Promise.all([get(KM), get(KW), get(KH)]).then(a => [a[0] || EMPTY(), a[1] || EMPTY(), a[2] || { list: [] }]);
    const blocked = doc.blocked || [];
    const ra = apply(doc, ent), rw = apply({ top: wdoc.top || [], blocked }, ent);
    const out = (top, wtop, reason) => json({ ok: true, changed: ra.changed || rw.changed, reason, week: weekInfo,
      rank: rankOf(top, ent.id, 'all') || rankOf(top, (top.find(x => key(x) === key(ent)) || {}).id, 'all'), weekRank: rankOf(wtop, ent.id, 'all') || rankOf(wtop, (wtop.find(x => key(x) === key(ent)) || {}).id, 'all'),
      top: view(top, 'all', limit), weekTop: view(wtop, 'all', limit) }, 200, c.h);
    if (!ra.changed && !rw.changed) return out(doc.top || [], wdoc.top || [], ra.reason);
    // rate limits (only counted for posts that actually change a board)
    const hr = Math.floor(now / 3600000), ip = await sha((req.headers.get('CF-Connecting-IP') || 'x') + '|mmp');
    const kd = `rl:${P}d:${ent.dev}:${hr}`, ki = `rl:${P}i:${ip}:${hr}`;
    const [nd, ni] = await Promise.all([env.MMP_SCORES.get(kd), env.MMP_SCORES.get(ki)]).then(a => a.map(x => +x || 0));
    if (nd >= MAX_DEV_HOUR || ni >= MAX_IP_HOUR) return json({ ok: false, error: 'rate limited, try later' }, 429, c.h);
    const writes = [env.MMP_SCORES.put(kd, String(nd + 1), { expirationTtl: 3900 }), env.MMP_SCORES.put(ki, String(ni + 1), { expirationTtl: 3900 })];
    const top = ra.changed ? ra.top : doc.top || [], wtop = rw.changed ? rw.top : wdoc.top || [];
    if (ra.changed) writes.push(env.MMP_SCORES.put(KM, JSON.stringify({ v: 1, top, blocked, updated: ent.ts })));
    if (rw.changed) writes.push(env.MMP_SCORES.put(KW, JSON.stringify({ v: 1, week: wk.key, top: wtop, updated: ent.ts }), { expirationTtl: WEEK_TTL }));
    // first board change of a new week: archive the previous active week's #1 as "Biggest Problem of the Week" (1 write per week)
    if (hos.cur !== wk.key) {
      const list = [...(hos.list || [])];
      if (hos.cur && !list.some(x => x.week === hos.cur)) {
        const old = await get(`week:${P}${hos.cur}`); const w1 = old && (old.top || []).find(x => !blocked.includes(x.id));
        if (w1) list.push({ week: hos.cur, ...w1 });
      }
      writes.push(env.MMP_SCORES.put(KH, JSON.stringify({ v: 1, cur: wk.key, list: list.sort((a, b) => b.week.localeCompare(a.week)).slice(0, 104) })));
    }
    await Promise.all(writes);
    return out(top, wtop, ra.changed ? 'ok' : 'week-best');
  }
};

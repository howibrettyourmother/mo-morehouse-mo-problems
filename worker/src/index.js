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

export default {
  async fetch(req, env) {
    const url = new URL(req.url), c = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: c.allowed ? 204 : 403, headers: c.h });
    if (url.pathname === '/' ) return json({ ok: true, service: 'morehouse-scores', endpoints: ['GET /scores?mode=all|y5|rookie&limit=25', 'POST /scores'] }, 200, c.h);
    if (url.pathname !== '/scores') return json({ ok: false, error: 'not found' }, 404, c.h);
    const board = BOARDS.has(url.searchParams.get('board')) ? url.searchParams.get('board') : 'main', K = 'board:' + board;
    const mode = ['all', 'y5', 'rookie'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'all';
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '25', 10) || 25));
    if (req.method === 'GET') {
      const doc = (await env.MMP_SCORES.get(K, { type: 'json' })) || { top: [] };
      return json({ ok: true, v: 1, board, mode, count: (doc.top || []).length, updated: doc.updated || 0, blocked: doc.blocked || [], top: view(doc.top || [], mode, limit) }, 200, c.h);
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405, c.h);
    if (!c.allowed) return json({ ok: false, error: 'origin not allowed' }, 403, c.h);
    let e; try { const txt = await req.text(); if (txt.length > 2000) throw 0; e = JSON.parse(txt) } catch { return json({ ok: false, error: 'bad json' }, 400, c.h) }
    if (!valid(e)) return json({ ok: false, error: 'invalid score' }, 422, c.h);
    const ent = clean(e, Math.floor(Date.now() / 1000));
    const doc = (await env.MMP_SCORES.get(K, { type: 'json' })) || { v: 1, top: [], blocked: [] };
    const r = apply(doc, ent);
    if (!r.changed) return json({ ok: true, changed: false, reason: r.reason, rank: rankOf(doc.top || [], r.reason === 'not-best' ? ((doc.top || []).find(x => key(x) === key(ent)) || {}).id : ent.id, 'all'), top: view(doc.top || [], 'all', limit) }, 200, c.h);
    // rate limits (only counted for writes that change the board)
    const hr = Math.floor(Date.now() / 3600000), ip = await sha((req.headers.get('CF-Connecting-IP') || 'x') + '|mmp');
    const kd = `rl:d:${ent.dev}:${hr}`, ki = `rl:i:${ip}:${hr}`;
    const [nd, ni] = await Promise.all([env.MMP_SCORES.get(kd), env.MMP_SCORES.get(ki)]).then(a => a.map(x => +x || 0));
    if (nd >= MAX_DEV_HOUR || ni >= MAX_IP_HOUR) return json({ ok: false, error: 'rate limited, try later' }, 429, c.h);
    const next = { v: 1, top: r.top, blocked: doc.blocked || [], updated: ent.ts };
    await Promise.all([env.MMP_SCORES.put(K, JSON.stringify(next)), env.MMP_SCORES.put(kd, String(nd + 1), { expirationTtl: 3900 }), env.MMP_SCORES.put(ki, String(ni + 1), { expirationTtl: 3900 })]);
    return json({ ok: true, changed: true, reason: 'ok', rank: rankOf(next.top, ent.id, 'all'), modeRank: rankOf(next.top, ent.id, ent.m), top: view(next.top, 'all', limit) }, 200, c.h);
  }
};

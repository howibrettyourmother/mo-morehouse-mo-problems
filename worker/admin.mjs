// Leaderboard admin (uses your wrangler login via CLOUDFLARE_API_TOKEN; prints no secrets)
//   node admin.mjs list [main|test]            all-time + this week + Hall of Shame
//   node admin.mjs delete <id> [main|test]     remove everywhere (all-time, this + last week, Hall of Shame) and block the id
//   node admin.mjs unblock <id> [main|test]
//   node admin.mjs put <key> <file.json>       raw write (migration)
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { weekOf } from './src/index.js';
const W = (...a) => execFileSync('npx', ['wrangler', 'kv', 'key', ...a, '--binding=MMP_SCORES'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const get = k => { try { const t = W('get', k); return t.trim() ? JSON.parse(t) : null } catch { return null } };
const put = (k, v, ttl) => { const f = path.join(os.tmpdir(), 'mmp-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(v)); W('put', k, '--path', f, ...(ttl ? ['--ttl', String(ttl)] : [])); fs.unlinkSync(f); console.log('saved', k) };
const [cmd, a1, a2] = process.argv.slice(2), board = (cmd === 'list' ? a1 : a2) || 'main', P = board === 'test' ? 'test:' : '';
const wk = weekOf(Date.now()), prev = new Date(Date.parse(wk.key + 'T12:00:00Z') - 7 * 86400e3).toISOString().slice(0, 10);
const KM = 'board:' + board, KH = 'hos:' + board, weeks = [wk.key, prev].map(k => `week:${P}${k}`);
const show = (t, l) => { console.log(`== ${t}: ${l.length}`); l.forEach((e, i) => console.log(String(i + 1).padStart(3), e.week || '', e.id, e.m, String(e.s).padStart(9), e.n)) };
if (cmd === 'list') {
  const m = get(KM) || {}, w = get(weeks[0]) || {}, h = get(KH) || {};
  show('ALL-TIME', m.top || []); show('THIS WEEK ' + wk.key, w.top || []); show('HALL OF SHAME (cur ' + h.cur + ')', h.list || []); console.log('blocked', m.blocked || []);
} else if (cmd === 'delete' || cmd === 'unblock') {
  const m = get(KM) || { v: 1, top: [], blocked: [] }, b = new Set(m.blocked || []);
  if (cmd === 'delete') {
    b.add(a1); m.top = (m.top || []).filter(e => e.id !== a1);
    for (const k of weeks) { const w = get(k); if (w && (w.top || []).some(e => e.id === a1)) { w.top = w.top.filter(e => e.id !== a1); put(k, w, 120 * 86400) } }
    const h = get(KH); if (h && (h.list || []).some(e => e.id === a1)) { h.list = h.list.filter(e => e.id !== a1); put(KH, h) }
  } else b.delete(a1);
  m.blocked = [...b]; m.updated = Math.floor(Date.now() / 1000); put(KM, m);
} else if (cmd === 'put') { put(a1, JSON.parse(fs.readFileSync(a2, 'utf8')), a1.startsWith('week:') ? 120 * 86400 : 0) }
else console.log('usage: node admin.mjs list|delete|unblock|put ...');

// One-time migration: scores/leaderboard.json (GitHub-merged) + every ntfy relay entry -> KV board doc (same validation + collapse as the Worker)
import fs from 'fs';
import { valid, collapse } from './src/index.js';
const [lbPath, ntfyPath, outPath] = process.argv.slice(2);
const lb = JSON.parse(fs.readFileSync(lbPath, 'utf8')), blocked = new Set(lb.blocked || []);
const stats = { fromJson: 0, fromNtfy: 0, invalid: 0, blocked: 0, dupes: 0 };
const all = new Map();
for (const e of lb.top || []) { if (!valid({ ...e, v: 1 })) { stats.invalid++; continue } all.set(e.id, { ...e }); stats.fromJson++ }
for (const line of fs.readFileSync(ntfyPath, 'utf8').split('\n')) {
  if (!line.trim()) continue; let m; try { m = JSON.parse(line) } catch { continue }
  if (m.event !== 'message') continue; let e; try { e = JSON.parse(m.message) } catch { stats.invalid++; continue }
  if (!valid(e)) { stats.invalid++; continue }
  if (all.has(e.id)) { stats.dupes++; continue }
  all.set(e.id, { id: e.id, n: e.n.trim(), s: e.s, t: e.t, m: e.m, p: e.p, d: e.d, b: e.b, dev: e.dev, ts: m.time }); stats.fromNtfy++;
}
const list = [...all.values()].filter(e => { if (blocked.has(e.id)) { stats.blocked++; return false } return true });
const top = collapse(list);
stats.collapsedAway = list.length - top.length; stats.final = top.length;
fs.writeFileSync(outPath, JSON.stringify({ v: 1, top, blocked: [...blocked], updated: Math.floor(Date.now() / 1000), migrated: stats }));
console.log(JSON.stringify(stats)); top.forEach(e => console.log(' ', e.id, e.m, e.s, e.n));

// Worker API test (weekly season + Hall of Shame + validation + dedupe). Uses the isolated test board and its time-travel `now` param.
//   node test-worker.mjs <baseUrl> <allowedOrigin>
import { weekOf } from './src/index.js';
const [BASE, ORIGIN] = process.argv.slice(2); let ok = true;
const chk = (n, c, i = '') => { ok &&= !!c; console.log((c ? 'PASS ' : 'FAIL ') + n, c ? '' : i) };
const rid = () => Math.random().toString(36).slice(2, 14).padEnd(12, 'x');
const H = { 'Content-Type': 'application/json', Origin: ORIGIN, 'User-Agent': 'mmp-worker-test' };
const post = (e, now) => fetch(`${BASE}/scores?board=test&now=${now}`, { method: 'POST', headers: H, body: JSON.stringify(e) }).then(async r => ({ st: r.status, j: await r.json() }));
const getB = (q) => fetch(`${BASE}/scores?board=test&${q}`, { headers: { 'User-Agent': 'mmp-worker-test' } }).then(r => r.json());
const ent = (n, s, dev, m = 'y5') => ({ v: 1, id: rid(), n, s, t: 3, d: 120, b: 0, p: 40, m, dev });
// pick two far-future weeks unique to this run so reruns never collide
const base = Date.UTC(2030, 0, 1) + Math.floor(Math.random() * 400) * 7 * 86400e3, w1 = weekOf(base), t1 = w1.start + 3600e3, t2 = w1.end + 3600e3, w2 = weekOf(t2);
const dev = rid(), dev2 = rid();
let r = await post(ent('TEST WEEK1 TOP', 9000, dev), t1); chk('post week 1 #1', r.st === 200 && r.j.changed && r.j.weekRank === 1, JSON.stringify(r));
r = await post(ent('TEST WEEK1 2ND', 4000, dev2), t1); chk('post week 1 #2', r.st === 200 && r.j.weekRank === 2, JSON.stringify(r));
r = await post(ent('TEST WEEK1 TOP', 5000, dev), t1); chk('lower score for same device+name is a no-op', r.j.changed === false && r.j.reason === 'not-best', JSON.stringify(r.j.reason));
let g = await getB(`period=week&now=${t1}`); chk('weekly board shows week 1', g.week.key === w1.key && g.top[0].n === 'TEST WEEK1 TOP' && g.top.length >= 2, JSON.stringify(g.week));
r = await post(ent('TEST WEEK2', 3000, rid()), t2); chk('post in week 2 (resets weekly board)', r.st === 200 && r.j.weekRank === 1 && r.j.week.key === w2.key, JSON.stringify(r.j.week));
g = await getB(`period=week&now=${t2}`); chk('week 2 board only has week 2 scores', g.top.length === 1 && g.top[0].n === 'TEST WEEK2', JSON.stringify(g.top.map(e => e.n)));
const hall = g.hallOfShame.find(x => x.week === w1.key); chk('week 1 #1 archived as Biggest Problem of the Week', hall && hall.n === 'TEST WEEK1 TOP' && hall.s === 9000, JSON.stringify(g.hallOfShame.slice(0, 3)));
g = await getB(`period=all&now=${t2}`); chk('all-time board keeps everything', ['TEST WEEK1 TOP', 'TEST WEEK1 2ND', 'TEST WEEK2'].every(n => g.top.some(e => e.n === n)));
chk('week boundaries are Tuesday 4am ET', new Date(w1.start).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false }) === 'Tue, 04', new Date(w1.start).toString());
r = await post({ ...ent('X'.repeat(17), 100, rid()) }, t2); chk('17-char name rejected', r.st === 422);
r = await post({ ...ent('TEST CHEAT', 2900000, rid()), d: 20 }, t2); chk('implausible score rejected', r.st === 422);
const bad = await fetch(`${BASE}/scores?board=test`, { method: 'POST', headers: { ...H, Origin: 'https://evil.example' }, body: JSON.stringify(ent('TEST EVIL', 100, rid())) }); chk('foreign origin rejected', bad.status === 403);
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);

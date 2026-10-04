# MOREHOUSE MORE PROBLEMS

**Mo Morehouse, Mo Problems.** A SHADYNASTY Production. A parody vertical arcade shooter inspired by 90s East Coast hip-hop (explicit language).

You are Joe Morehouse, a sad cartoon GM in Year 4 of the rebuild ("Rebuilding Morehouse"), trying to survive one more season against waves of your own problems: Caleb sacks, MHJ busts, Pitts resets, Darnold INTs, rejected trades, 4th-round picks, Rebuild Year calendars. Then the final boss shows up: THE WILSON WEASELS (BEST TEAM IN THE LEAGUE), Brett's crowned juggernaut with #1 foam fingers, stacks of cash and a POWER RANKINGS #1 belt, raining Mahomes, Lamb, Lamar, JSN and CMC down on you.

- Drag to move, footballs auto-fire. RED = incoming problems, shoot them. GOLD stars = rare hope (Waiver Wire Pickup, Desperate Trade Offer...), catch them.
- When Joe's crying gets bad, somebody calls a WAAAAHMBULANCE.
- Fill the SHIT COMBO meter for a FIRE SALE screen clear. The Weasel answers with a slow-mo EAT SHIT taunt.
- Tracks: Year 4 of the Rebuild / Mo Picks Mo Problems / Mo Busts Mo Problems / Survive the Trade Deadline / The Weasel Dynasty.
- Original procedural boom-bap chiptune (WebAudio). No samples, no real lyrics.

- **TANK WATCH**: title-screen button (with a live `JOE: xx% FOR 1.01` teaser from Sleeper league + rosters, silent if offline) and a `SEE JOE'S TANK →` button on the end screen open the [Tank for Jeremiah Smith](https://howibrettyourmother.github.io/tank-for-jeremiah-smith/) page in the same tab; its pinned BACK TO THE GAME button returns (works in iOS home-screen mode). `src/nav_test.py` checks the round trip.
- **League Leaderboard** (weekly + all-time + Hall of Shame, top 25, names up to 16 chars, score, tracks survived, mode tag) on the title and end screens; your run is highlighted with your rank. Local Hall of Shame is kept as the offline fallback.
- **Modes:** Rookie (5 seasons, slower problems) or Year 5 of the Rebuild (the real deal). Tap to skip the intro.
- **Mini-boss: THE TRADE DEADLINE**, a fax machine spitting DECLINED trade offers. Plus the ghost of **PUKA NACUA (DROPPED)**, floating past forever out of reach.
- End screen: Joe sobbing face-down on a desk of rejected trade offers under his own rain cloud. PUKAS DROPPED: 1 (FOREVER). SHOEYS OWED: N, and JOE OWES THE LEAGUE N SHOEYS.
- **Shoeys (league rules):** lose a life and you sometimes get a SHOEY PENALTY cartoon (beer poured into a sneaker, Joe chugs, gags). Each lost life adds a shoey owed, and the share text says how many. A rare gold **LIQUID COURAGE SHOEY** gives beer goggles (wobbly screen), a burp, triple shots and +1 season.
- **Weasel stars:** the boss rains Mahomes, Lamb, Lamar, CMC and JSN cards. Caleb's card carries a pink nail-polish bottle.
- **Voice:** 269 TTS lines (see `heckles-list.md`). Each category is a shuffle-bag, none of the last 15 lines can repeat, and there's a 3.2–5 s heckle cooldown. Lines are lazy-loaded from `vo.json`.
- **iPhone home-screen mode:** the game reads the notch/status-bar and home-indicator insets and lays itself out inside the safe area, so the HUD, buttons and their tap areas are never covered. Normal Safari is unchanged. Test: `python3 src/safearea_test.py`.
- **Home-screen icon:** MMP crest (`apple-touch-icon.png`, `icon-192/512.png`, `favicon.ico`, `manifest.webmanifest`). Regenerate it with `python3 src/make_icons.py`, which also rebuilds `og.png`.

### Leaderboard backend (Cloudflare Worker, free tier)
- `https://morehouse-scores.brettwilson08.workers.dev`. The source is in `worker/`; it's deployed from `/workspace/morehouse-scores` with `npx wrangler@3 deploy`.
- `GET /scores?mode=all|y5|rookie&limit=25` returns the top scores. `POST /scores` takes a run JSON, and only the game's origin (`https://howibrettyourmother.github.io`) is allowed to post.
- The Worker runs the same validation as the game: 16-char names, a 3M score cap, and time/track/boss plausibility checks. It also rate-limits each device to 12 new scores per hour and each IP (stored hashed) to 40 per hour.
- It keeps one best entry per device+name, with the mode tag. Re-posting a score that's already on the board costs zero KV writes. That keeps a single board key plus small TTL counter keys, so writes stay far below the free daily limit.
- The client re-posts each device's personal best on load. If the Worker is unreachable, posts wait in a local queue and retry, and the local Hall of Shame still works.
- **Weekly season:** the board resets every Tuesday at 4am ET (DST-aware). Tabs: THIS WEEK / ALL-TIME / HALL OF SHAME. On the first new score of a new week, last week's #1 is inducted into the Hall of Shame as Biggest Problem of the Week (one KV write per week). Weekly keys expire after 120 days.
- Admin (needs your wrangler login, run from `worker/`): `node admin.mjs list`, `node admin.mjs delete <id>` (removes it from all-time, this and last week, and the Hall of Shame, and blocks the id), `node admin.mjs unblock <id>`, `node admin.mjs put <key> <file.json>`. Tests use the isolated `board=test` (`node test-worker.mjs <worker url> <origin>`).
- Free-tier budget: a new score costs up to ~4 KV writes (all-time, week, 2 rate-limit counters), so roughly 250 new scores/day.
- The old ntfy relay + GitHub Action is retired; its last state is archived in `scores/`.

### Audio performance
All SFX and the music are pre-rendered once with OfflineAudioContext, so each hit is one buffer source on a shared bus. One-shot sources are
capped at 8 (SFX at most 5), plus 4 persistent beds (music loop, crowd, murmur, crackle), and every source is disconnected when it ends. There is
a single compressor on the master bus, SFX throttling gets harder during combos, and a low-power mode (fewer particles, no glow, DPR 1.5) kicks in when frames
run over 20ms. `src/stress.py` runs a CPU-throttled high-combo stress test.

Morehouse: 99 problems and still broke. Wilson Weasels: still the best team in the league.

Play: https://howibrettyourmother.github.io/mo-morehouse-mo-problems/

# MOREHOUSE MORE PROBLEMS

**Mo Morehouse, Mo Problems.** A SHADYNASTY Production. A parody vertical arcade shooter inspired by 90s East Coast hip-hop (explicit language).

You are Joe Morehouse, a sad cartoon GM in Year 4 of the rebuild ("Rebuilding Morehouse"), trying to survive one more season against waves of your own problems: Caleb sacks, MHJ busts, Pitts resets, Darnold INTs, rejected trades, 4th-round picks, Rebuild Year calendars. Then the final boss shows up: THE WILSON WEASELS (BEST TEAM IN THE LEAGUE), Brett's crowned juggernaut with #1 foam fingers, stacks of cash and a POWER RANKINGS #1 belt, raining Mahomes, Lamb, Lamar and CMC down on you.

- Drag to move, footballs auto-fire. RED = incoming problems, shoot them. GOLD stars = rare hope (Waiver Wire Pickup, Desperate Trade Offer...), catch them.
- When Joe's crying gets bad, somebody calls a WAAAAHMBULANCE.
- Fill the SHIT COMBO meter for a FIRE SALE screen clear. The Weasel answers with a slow-mo EAT SHIT taunt.
- Tracks: Year 4 of the Rebuild / Mo Picks Mo Problems / Mo Busts Mo Problems / Survive the Trade Deadline / The Weasel Dynasty.
- Original procedural boom-bap chiptune (WebAudio). No samples, no real lyrics.

- **League Leaderboard** (top 25, names up to 16 chars, score, tracks survived, mode tag) on the title and end screens; your run is highlighted with your rank. Local Hall of Shame is kept as the offline fallback.
- **Modes:** Rookie (5 seasons, slower problems) or Year 5 of the Rebuild (the real deal). Tap to skip the intro.
- **Mini-boss: THE TRADE DEADLINE**, a fax machine spitting DECLINED trade offers. Plus the ghost of **PUKA NACUA (DROPPED)**, floating past forever out of reach.
- End screen: Joe sobbing face-down on a desk of rejected trade offers under his own rain cloud. PUKAS DROPPED: 1 (FOREVER).

### Leaderboard backend (no accounts, no secrets)
Browsers POST scores as JSON to a public [ntfy.sh](https://ntfy.sh) topic (`mmp-league-scores-k7q2v9x4`, CORS-open, 12h retention). The game reads the
aggregated board (`scores/leaderboard.json` via raw.githubusercontent) plus the last 12h of the topic for instant updates. A GitHub Action
(`.github/workflows/scores.yml`, every 5 min) runs `scores/aggregate.py`: validates names/ids/mode, caps scores, checks plausibility against
the seconds actually played, tracks and bosses, rate-limits 12 runs/hour per device, applies `scores/blocklist.json`, and commits the board.
To remove a score: add its id to `scores/blocklist.json` and push (the Action re-runs on that push).

### Audio performance
All SFX and the music are pre-rendered once with OfflineAudioContext, so each hit is one buffer source on a shared bus. One-shot sources are
capped at 8 (SFX at most 5), plus 4 persistent beds (music loop, crowd, murmur, crackle), and every source is disconnected when it ends. There is
a single compressor on the master bus, SFX throttling gets harder during combos, and a low-power mode (fewer particles, no glow, DPR 1.5) kicks in when frames
run over 20ms. `src/stress.py` runs a CPU-throttled high-combo stress test.

Morehouse: 99 problems and still broke. Wilson Weasels: still the best team in the league.

Play: https://howibrettyourmother.github.io/mo-morehouse-mo-problems/

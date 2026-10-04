# Archived leaderboard data

The league leaderboard now runs on a Cloudflare Worker + KV (`morehouse-scores.brettwilson08.workers.dev`, source in `../worker/`).
The old pipeline (ntfy.sh relay + GitHub Action merger) is retired. `leaderboard.json` and `blocklist.json` are the last
state of that pipeline, and were migrated into the Worker's KV on 2026-10-03 (see `worker/migrate.mjs`).

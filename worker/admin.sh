#!/usr/bin/env bash
# Leaderboard admin from the command line (uses your wrangler auth; nothing secret is stored here).
#   ./admin.sh list [main|test]            show the board
#   ./admin.sh delete <id> [main|test]     remove an entry + block that id from coming back
#   ./admin.sh unblock <id> [main|test]
#   ./admin.sh import <file.json> [main|test]   replace the board doc (used for migration)
set -euo pipefail
cd "$(dirname "$0")"
cmd=${1:-list}; B=${3:-${2:-main}}; [[ $cmd == list ]] && B=${2:-main}
K="board:$B"; T=$(mktemp)
get(){ npx wrangler kv key get --binding=MMP_SCORES "$K" 2>/dev/null > "$T" || echo '{"v":1,"top":[],"blocked":[]}' > "$T"; [ -s "$T" ] || echo '{"v":1,"top":[],"blocked":[]}' > "$T"; }
put(){ npx wrangler kv key put --binding=MMP_SCORES "$K" --path "$1" >/dev/null 2>&1 && echo "saved $K"; }
case $cmd in
  list) get; node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log((d.top||[]).length+" entries, blocked "+(d.blocked||[]).length);(d.top||[]).forEach((e,i)=>console.log(String(i+1).padStart(3),e.id,e.m,String(e.s).padStart(9),e.n))' "$T";;
  delete|unblock) get; node -e 'const fs=require("fs"),[f,id,c]=process.argv.slice(1);const d=JSON.parse(fs.readFileSync(f));const b=new Set(d.blocked||[]);if(c==="delete"){d.top=(d.top||[]).filter(e=>e.id!==id);b.add(id)}else b.delete(id);d.blocked=[...b];d.updated=Math.floor(Date.now()/1000);fs.writeFileSync(f,JSON.stringify(d))' "$T" "$2" "$cmd"; put "$T";;
  import) B=${3:-main}; K="board:$B"; put "$2";;
  *) echo "usage: $0 list|delete|unblock|import ..."; exit 1;;
esac
rm -f "$T"

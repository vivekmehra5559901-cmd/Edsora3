#!/bin/sh
# concatenates src/*.js into ONE _worker.js (Cloudflare Pages drag-and-drop needs a single file)
cd "$(dirname "$0")"
{ echo "/* Edsora backend — Cloudflare Pages _worker.js (generated). Edit ONLY the SECRETS block at the top. */"
  for f in src/00_secrets.js src/10_util.js src/shared.js src/25_storage.js src/20_db.js src/30_auth.js src/40_files.js src/50_llm.js src/60_campaign.js src/70_pay.js src/80_admin.js src/99_main.js; do echo; echo "/* ═══ $(basename $f) ═══ */"; sed '/^if(typeof module/d' "$f"; done; } > dist_worker.js
node --check dist_worker.js 2>&1 | head -5; wc -c dist_worker.js

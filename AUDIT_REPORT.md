# Edsora build audit — 18 October 2026

## Scope reviewed
- `reference_inputs/Edsora__8.html`, `Admin_3.html`, and the supplied reference HTML/image/XLSX files preserved in the project.
- User prompt files: `02_PROMPTS_VERBATIM_part1.md` and `02_PROMPTS_VERBATIM_part2.md` (kept alongside the original source inputs where supplied).
- `DEPLOYABLE/index.html`, `DEPLOYABLE/_worker.js`, `DEPLOYABLE/admin/index.html`, `source/src/*.js`, and the frontend build inputs.

## Automated checks run in this environment
- `node --check DEPLOYABLE/_worker.js` — passed.
- `node --check` against all inline scripts in `DEPLOYABLE/index.html` and `DEPLOYABLE/admin/index.html` — passed.
- `node source/tests/shared.test.js` — 10 passed, 0 failed.
- Playwright + system Chromium visual rendering — 12 screenshots generated under `evidence/`, 0 page errors reported by the harness. Because browser navigation is blocked here, the exact HTML bytes were rendered using `page.set_content`; modal states were displayed locally for screenshot evidence. This is not live-origin E2E proof.
- `source/build.sh` — generated `source/dist_worker.js`; it matches `DEPLOYABLE/_worker.js` byte-for-byte.

## Requirements present in the build
- Edsora #8 source is used as the frontend base and assembled as `DEPLOYABLE/index.html`.
- Admin UI is separate at `DEPLOYABLE/admin/index.html`; server-side Google ID-token validation and administrator allowlist are implemented.
- PhonePe AutoPay setup, server-side status verification with PhonePe, webhook-as-hint re-verification, idempotent activation/renewal, 29-day subscription cycle, and four-seat allocation are implemented in source.
- CSV/Excel import parsing, persistent per-account records, inline edits, canonical row processing, aggregate dashboard statistics, blank-file handling, and unchanged-upload protection are implemented in source.
- Referral seat claims check the buyer email server-side; the UI has the “Knock knock... Admin?” and “Connect & Unlock” states.
- Same-day campaign state, per-student fingerprint tracking, pause/resume endpoints, and the resume toast action are implemented.
- PWA install sheet, gift reveal, and supplied Excel workbook are present.
- Original reference attachments remain in `reference_inputs/`; the workbook is also copied to `DEPLOYABLE/assets/`.

## Outstanding gaps / required verification
1. **LLM tone requirement:** The backend currently uses the LLM to clean spreadsheet names. Fee reminder text is generated from one fixed approved WhatsApp template and carries a computed tone bucket; the five distinct LLM-authored 30–50-word tone variants specified in the prompt are not implemented as separate message bodies. WhatsApp template constraints also mean any live-sending wording must match an approved template. This needs an explicit product decision and corresponding approved template setup before calling that item complete.
2. **Live backend integration tests:** `source/tests/run_api.mjs` requires Cloudflare Wrangler and local D1 emulation. Wrangler is unavailable here, so the API/payment/webhook/seat/campaign integration suite has not been run in this environment.
3. **Provider tests:** Live Google OAuth/Firebase authorized domains, PhonePe sandbox checkout, mandate and webhook, WhatsApp approved template delivery, D1 persistence, subscription expiry/cancellation/refund, and any optional Backblaze object storage require deployment credentials and an accessible deployed origin.
4. **Browser-origin testing:** Localhost and file navigation are blocked in this execution environment. Screenshots prove local HTML rendering and requested modal appearance only; they do not prove live auth or API connectivity.
5. **Deployment secrets:** Keep LLM keys, PhonePe client secret, WhatsApp token, and storage credentials in Cloudflare server-side secrets/bindings. Do not embed them into public HTML or commit real credentials to source.

## Screenshot index
- `01-dashboard-light.png`, `02-dashboard-dark.png`
- `03-dashboard-mobile-light.png`, `04-dashboard-mobile-dark.png`
- `05-signup-popover-light.png`, `06-signup-popover-dark.png`
- `07-seat-popover-light.png`, `08-seat-email-step.png`
- `09-pwa-sheet-light.png`, `10-free-gift-unpacked.png`, `11-pwa-sheet-dark.png`
- `12-admin-light.png`

`browser-results.json` records the screenshot method and its verification boundary.

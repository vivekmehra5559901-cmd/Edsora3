# Edsora deployment and configuration

## Bundle layout
- `DEPLOYABLE/` is the Cloudflare Pages upload folder. Its `index.html` is the assembled Edsora #8 UI, `_worker.js` is the server API, and `admin/` is the admin UI route.
- `source/src/` contains editable backend modules. Run `sh source/build.sh` from the project root to regenerate `dist_worker.js`; copy it to `DEPLOYABLE/_worker.js` after changing backend code.
- `source/frontend/build_index.py` assembles `reference_inputs/Edsora__8.html` with the backend client, UI extras into `DEPLOYABLE/index.html`.

## Cloudflare Pages setup
1. Upload the contents of `DEPLOYABLE/` to a Pages project using the Pages direct-upload flow.
2. Create a Cloudflare D1 database and bind it as `DB` in Pages settings. The worker initializes its schema on API access.
3. Configure secrets as Worker/Pages environment variables. Provider keys can be pasted directly into Cloudflare Pages environment variables (recommended; no rebuild needed).
   - `GEMINI_API_KEYS`, `GROQ_API_KEYS` (comma-separated API keys)
   - `B2_KEY_ID`, `B2_KEY`, `B2_BUCKET`, `B2_BUCKET_ID`, `B2_ENDPOINT` (optional persistent object storage)
   - `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION` (PhonePe Business Dashboard → Developer Settings). Optional: `PHONEPE_ENV=sandbox` for test mode (leave unset for live), `PHONEPE_WEBHOOK_USERNAME` / `PHONEPE_WEBHOOK_PASSWORD` (only if you set a webhook username/password in the PhonePe dashboard).
   - `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_TEMPLATE_NAME`, `WA_TEMPLATE_LANGUAGE`
   - Firebase public web config values are read by `/api/public-config`; Firebase Admin SDK credentials are not needed because Google ID tokens are verified through Google's public JWKS.
4. Register the PhonePe webhook at `https://YOUR-DOMAIN/webhook/phonepe` (events: `subscription.setup.order.completed/failed`, `subscription.redemption.order.completed/failed`, `subscription.cancelled`, `subscription.revoked`, `subscription.paused`). The webhook is only a hint — Edsora always re-checks the real status with PhonePe's API before unlocking or extending anything.
4b. **29-day auto-renewal poller (required):** PhonePe has no 29-day frequency, so Edsora sends each pre-debit notice itself. Cloudflare Pages has no cron, so create a free job at cron-job.org (or any scheduler) that calls `https://YOUR-DOMAIN/api/pay/renew-due` every 6 hours. It is safe to call as often as you like (idempotent, rate-limited). It also runs automatically when a paying owner opens the app in the last 2 days of a cycle.
5. Create/approve the WhatsApp Utility template named `edsora_fee_reminder` with the parameter order documented in `source/src/00_secrets.js`.
6. The admin allowlist in `source/src/00_secrets.js` uses placeholder addresses (`admin1@example.com`, `admin2@example.com`) for public-source safety. Replace them with your intended administrator Google accounts before deployment, or configure `ADMIN_EMAILS` as a Cloudflare server-side environment variable. Admin APIs verify Google sign-in tokens and the server-side allowlist.
7. Test `/api/health` and `/api/public-config` after deployment. Keep all secret values in the server environment; never put PhonePe client secret, WhatsApp access token, LLM keys, or storage keys in browser code.

## Included checks
Run `node source/tests/shared.test.js` and `node --experimental-sqlite source/tests/phonepe.test.mjs` (46 PhonePe payment/renewal/webhook checks against a fake PhonePe server; no network needed; Node 22+). The payment cases inside `run_api.mjs` are from the old Razorpay flow and no longer apply. The backend integration harness in `source/tests/run_api.mjs` expects Cloudflare `wrangler` and local bindings; run it in a development environment where Wrangler is installed. A successful unit test run is not a substitute for configuring live provider credentials and completing a real payment/webhook test.

## Credentials and integrations

Edit only the clearly marked `SECRETS` object at the top of `source/src/00_secrets.js` for the simple paste-in configuration block. All configurable provider values and the admin email allowlist are inside that object; everything below its closing marker is application logic and should not be edited. Keep this file private because it contains server-side credentials after you fill it in. If you edit backend source files, regenerate the worker with `sh source/build.sh` from `source/`, then copy `source/dist_worker.js` to `DEPLOYABLE/_worker.js`. Environment variables do not require a rebuild.

- LLM routing: paste up to five Gemini keys and five Groq keys into `GEMINI_API_KEYS` and `GROQ_API_KEYS`. Empty slots are skipped.
- Backblaze B2: fill `applicationKeyId`, `applicationKey`, `bucketName`, `bucketId`, and `s3Endpoint` under `BACKBLAZE`.
- PhonePe Autopay: fill `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`. The plan is ₹2,499 charged at sign-up and then every 29 days by UPI AutoPay (a FIXED ₹2,499 on-demand mandate; Edsora sends the PhonePe pre-debit notice + auto-debit 2 days before each period ends). Your PhonePe merchant account must have Autopay/Subscriptions enabled. Webhook: `https://YOUR-DOMAIN/webhook/phonepe`.
- WhatsApp Business: paste the access token and Phone Number ID. The Phone Number ID field also accepts the full Graph `/v26.0/PHONE_NUMBER_ID/messages` URL. Configure the exact approved template name/language that matches the body documented in the secrets file.
- Firebase web config is prefilled. It is public client configuration, not a server credential; the backend serves the public config endpoint.

## Cloudflare Pages deployment without a Wrangler build step

Upload the contents of `DEPLOYABLE/` using the Pages Direct Upload interface. This project intentionally does not require a `wrangler.toml` or a frontend build command for deployment: the frontend is preassembled as `index.html`, and the backend is the generated Pages `_worker.js`. Bind the D1 database as `DB` in the Pages project settings before exercising API routes. Do not upload the `source/` folder as the site root.

The PWA icons in `DEPLOYABLE/icons/` are derived from the supplied `reference_inputs/Edsoralogo.jpg`; `manifest.json` points to those icons.


## Plan and renewal behavior
Placeholder admin emails are stored in the same clearly marked configuration section as the other settings in `source/src/00_secrets.js`; replace them with your intended administrator accounts before deployment. They have admin-panel access only and remain on the Free plan. Admin access is checked server-side by Google email. `ADMIN_EMAILS` in Cloudflare is an optional override, not a required setup step.

Each paid cycle is 29 days and renews automatically through PhonePe UPI AutoPay (₹2,499 per cycle). Cancelling stops renewal; Pro stays until the end of the paid period. If a debit fails, Edsora retries the notice (up to 4 times, ≥12 h apart) and gives a 3-day grace window before the plan lapses.

## Environment variables and D1
Set provider keys in Cloudflare Pages environment variables; this avoids rebuilding for credential changes. Create a Cloudflare D1 database and bind it to this Pages project using the binding name `DB`. The zip cannot create or bind a database in your Cloudflare account; that step must be completed in the dashboard.

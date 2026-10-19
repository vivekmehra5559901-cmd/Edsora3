/* ╔══════════════════════════════════════════════════════════════════════════════════╗
   ║  EDSORA — SECRETS                                                                ║
   ║  This block is the ONLY thing you ever edit in this ZIP.                         ║
   ║  Paste each key between the quotes. Leave anything you do not have as ''.        ║
   ║  This file runs on Cloudflare's server — it is never sent to a visitor's browser.║
   ╚══════════════════════════════════════════════════════════════════════════════════╝ */
const SECRETS = {

  /* ── 1 · LLM APIs — 10 keys: Gemini ×5 + Groq ×5 ──────────────────────────────────────
     Paste each key between the quotes. Empty slots are simply skipped.
     Edsora routes between all pasted keys by itself: it spreads the load across Gemini and
     Groq in turns, and if a key is rate-limited, out of quota or invalid it moves to the next
     one automatically — you never have to do anything else. */
  GEMINI_API_KEYS: [
    '',   // Gemini key 1
    '',   // Gemini key 2
    '',   // Gemini key 3
    '',   // Gemini key 4
    '',   // Gemini key 5
  ],
  GROQ_API_KEYS: [
    '',   // Groq key 1
    '',   // Groq key 2
    '',   // Groq key 3
    '',   // Groq key 4
    '',   // Groq key 5
  ],

  /* ── 2 · Backend APIs — Backblaze B2 cloud storage (your uploaded Excel/CSV files live here) ── */
  BACKBLAZE: {
    applicationKeyId: '',
    applicationKey: '',
    bucketName: '',
    bucketId: '',
    s3Endpoint: '',            // e.g.  s3.us-west-004.backblazeb2.com
  },

  /* ── 3 · PhonePe Autopay (UPI mandate) ─────────────────────────────────────────────────
     PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET / PHONEPE_CLIENT_VERSION: PhonePe Business Dashboard → Developer Settings → API Keys.
     Price: ₹2,499 charged at sign-up, then AUTOMATICALLY every 29 days. PhonePe has no "29-day" frequency, so Edsora creates a
     FIXED ₹2,499 on-demand mandate and sends PhonePe's pre-debit notice + auto-debit by itself 2 days before each 29-day period ends.
     Webhook URL to register (optional but recommended):  https://YOUR-DOMAIN/webhook/phonepe
     (Edsora never trusts a webhook blindly — it always re-checks the real status with PhonePe's API.)
     Test mode: set the Cloudflare variable PHONEPE_ENV = sandbox  (leave unset for live/production). */
  PHONEPE_CLIENT_ID: '',
  PHONEPE_CLIENT_SECRET: '',
  PHONEPE_CLIENT_VERSION: '',

  /* ── 4 · WhatsApp Business API (Meta) ────────────────────────────────────────────────
     Messages are sent with your APPROVED TEMPLATE (Meta requires this for business-initiated messages).
     Template name: edsora_fee_reminder   ·   Language: en   ·   Category: Utility   ·   Body (exactly):

       Hello {{1}}, this is a fee payment reminder from {{2}} regarding {{3}}. An amount of ₹{{4}} remains
       outstanding, with a due date of {{5}}. Kindly complete your payment using the payment link provided
       below: {{6}}. If you have already paid, please disregard this reminder.

     {{1}} Parent/Guardian name · {{2}} School name · {{3}} Student name · {{4}} Pending amount ·
     {{5}} Due date · {{6}} the payment link of the school that is sending the message. */
  WA_ACCESS_TOKEN: '',
  WA_PHONE_NUMBER_ID: '',      // the Phone Number ID (pasting the full  .../v26.0/ID/messages  URL also works)
  WA_TEMPLATE_NAME: 'edsora_fee_reminder',   // already filled — change only if you named your template differently
  WA_TEMPLATE_LANGUAGE: 'en',                // already filled — the template's language code

  /* ── 5 · Google Auth sign-in API — your Firebase web config (already filled in) ───────── */
  /* ── 6 · Admin Google accounts — admin access does NOT grant a paid subscription ── */
  ADMIN_EMAILS: [
    'admin1@example.com',
    'admin2@example.com',
  ],

  FIREBASE_WEB_CONFIG: {
    apiKey: "AIzaSyDMJ6xO-t-m_q6e_YYfp8ewGngb-YU_AYU",
    authDomain: "edsora-8ee49.firebaseapp.com",
    projectId: "edsora-8ee49",
    storageBucket: "edsora-8ee49.firebasestorage.app",
    messagingSenderId: "750571126704",
    appId: "1:750571126704:web:2de4f79f28932aaddea075",
    measurementId: "G-1Z9KCRP45J",
  },
};
/* ═══════════════════════════ END OF SECRETS — nothing below needs editing ═══════════════════════════ */

const ADMIN_EMAILS = SECRETS.ADMIN_EMAILS; // optional Cloudflare ADMIN_EMAILS overrides this list
const PRICE_PAISE = 249900, CURRENCY = 'INR', CYCLE_DAYS = 29, SEATS_PER_PLAN = 4, DEFAULT_COUNTRY_CODE = '91';
/* the approved WhatsApp template (kept here ONLY so the app can preview exactly what parents receive) */
const WA_TEMPLATE_BODY = 'Hello {{1}}, this is a fee payment reminder from {{2}} regarding {{3}}. An amount of \u20B9{{4}} remains outstanding, with a due date of {{5}}. Kindly complete your payment using the payment link provided below: {{6}}. If you have already paid, please disregard this reminder.';
const SEAT_BLOCK_AFTER_SENT = 200;   // a seat admin cannot start another campaign the same day once more than this many were sent
const MAX_ROWS = 10000, MAX_BODY = 8 * 1024 * 1024, UNCHANGED_LIMIT = 5;

const WA_API_VERSION = 'v26.0';
function cfg(env) {
  const pick = (a, b) => (a !== undefined && a !== null && String(a).trim() !== '' ? String(a).trim() : String(b || '').trim());
  const list = (envV, arr) => (envV ? String(envV).split(',') : (arr || [])).map(x => String(x || '').trim()).filter(Boolean);
  const fb = SECRETS.FIREBASE_WEB_CONFIG || {}, bb = SECRETS.BACKBLAZE || {};
  let phoneId = pick(env.WA_PHONE_NUMBER_ID, SECRETS.WA_PHONE_NUMBER_ID), ver = WA_API_VERSION;
  const um = /graph\.facebook\.com\/(v[\d.]+)\/(\d+)/i.exec(phoneId); if (um) { ver = um[1]; phoneId = um[2]; }   // accepts the full URL too
  return {
    gemini: list(env.GEMINI_API_KEYS, SECRETS.GEMINI_API_KEYS), groq: list(env.GROQ_API_KEYS, SECRETS.GROQ_API_KEYS),
    b2: { keyId: pick(env.B2_KEY_ID, bb.applicationKeyId), key: pick(env.B2_KEY, bb.applicationKey), bucket: pick(env.B2_BUCKET, bb.bucketName), bucketId: pick(env.B2_BUCKET_ID, bb.bucketId), endpoint: pick(env.B2_ENDPOINT, bb.s3Endpoint) },
    ppId: pick(env.PHONEPE_CLIENT_ID, SECRETS.PHONEPE_CLIENT_ID), ppSecret: pick(env.PHONEPE_CLIENT_SECRET, SECRETS.PHONEPE_CLIENT_SECRET), ppVersion: pick(env.PHONEPE_CLIENT_VERSION, SECRETS.PHONEPE_CLIENT_VERSION), ppEnv: pick(env.PHONEPE_ENV, '').toLowerCase(), ppBase: pick(env.PHONEPE_API_BASE, ''),
    ppWhUser: pick(env.PHONEPE_WEBHOOK_USERNAME, ''), ppWhPass: pick(env.PHONEPE_WEBHOOK_PASSWORD, ''),
    wa: { token: pick(env.WA_ACCESS_TOKEN, SECRETS.WA_ACCESS_TOKEN), phoneId, template: pick(env.WA_TEMPLATE_NAME, SECRETS.WA_TEMPLATE_NAME), lang: pick(env.WA_TEMPLATE_LANGUAGE, SECRETS.WA_TEMPLATE_LANGUAGE) || 'en', version: ver },
    fb: { apiKey: pick(env.FIREBASE_API_KEY, fb.apiKey), authDomain: pick(env.FIREBASE_AUTH_DOMAIN, fb.authDomain), projectId: pick(env.FIREBASE_PROJECT_ID, fb.projectId), storageBucket: pick(env.FIREBASE_STORAGE_BUCKET, fb.storageBucket), messagingSenderId: pick(env.FIREBASE_SENDER_ID, fb.messagingSenderId), appId: pick(env.FIREBASE_APP_ID, fb.appId), measurementId: pick(env.FIREBASE_MEASUREMENT_ID, fb.measurementId) },
    waBase: pick(env.WA_API_BASE, 'https://graph.facebook.com'), llmBase: pick(env.LLM_BASE_URL_OVERRIDE, ''),
    jwksUrl: pick(env.FIREBASE_JWKS_URL, 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  };
}

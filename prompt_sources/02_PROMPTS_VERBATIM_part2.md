# EDSORA — ORIGINAL PROMPTS, VERBATIM (Part 2 of 3: the two colossal BACKEND prompts)

## Wrapper message that carried the backend prompts (verbatim)

/polish
Continue the massive build with absolute mastery, claude. It's an responsibility.

Prevent mistakes. Refine things, correct things.

Lastly provide me an summery, that what you did, and what you didn't do and why, and what you will do to do anything remaining, or honestly say uf nithing remaims aspire prompt provided level.

Test web html on headless browser Chromium, with python playwright MCP or tiny fish, and bring me screenshots of proper perfect updates as evidence. Handover me, my updated file named 'Edsora1.zip'

(Uploaded with it: Edsora__8.html, Admin_3.html, Edsora_Free_Gift.xlsx, netconnect.html)

======================================================================
## BACKEND PROMPT 1 OF 2 (document: logistics, backend items 1–8)
======================================================================

⦿ Backend Starts From Here:

1. Backend CSV/Excel Uploading & Display logic
2. Backend Excel De-duplicate Uploading & Updating Logic
3. Backend LLM messages generation tone and logic
4. De-duplication for same day same person messaging system
5. Backend web-hook payment activation logic
6. Backend days count for subscription logic
7. De-duplication for same person in new file in numerical data dashboard
8. Backend logic for referral link + seats to activate premium plan + web app admin role
9. Backend logic for my admin panel, email it supports
10. Backend logic for video config, referral config, account section in my admin panel.

Additional: core important distinction in web app user admin, and me as my web app admin.

Rules:

- The recently developed file, edsora #6.html is main HTML of this zip. No other, or cheaper version should appear. Rename to embed properly as index.html

- Backend logics given by me have to strictly support the API calls, web-hook, backend keys have to perform like I set up them.

- The zip have just one leaved structured section to integrate secrets (API keys), this file have to be so so easy, so perfectly coded that I have to paste the keys only, no other code.

--------

Flow:

○ Understand logic, mostly it fits product, and you can also add something you think it would refine the backend, but do not overdo.
○ Let me know what you did on the freedom command, I allow you to refine, so answer me that what you did.
○ I have exactly -- API keys, 1 web-hook URL. Structure is:
LLM APIs:

Backend APIs:


Rozarpay Web-hook: 1

WA business API:

Google Auth sign in API: 1

So the secrets/config file have to structure as I shared the numbers you.

---------
Your role: You are an elite, powerful, understanding, young, experienced modern intelligent coder & app/web app backend developer. You are very skilled & had strong, preventive skills for any detected ongoing mistakes too.

My Logistics / Workflow of SaaS / Web app Roles are here:

**1. Backend CSV/Excel Uploading & Display logic.**

If user selects an excel file, it needs to be uploaded in backend, and never itself become vanish or disappear for users. At the same time, per account, the files differ. No glitching files and amounts and maths for users, every user have rights, and allowed to put files as much they need, there is a limit if 5+ files appear as same, in one day. Only if same, it can trigger toast of "5 unchanged files detected. You’ve reached the limit."

Toast theme: black label and white text in light mode,
White label and black text in dark mode. cross SVG applies same. Stays 5 seconds max than itself disappear.

The csv/excel file when embedded, it counts the amount, system count it's content.

It counts:
• Number of total students in file
• number of students there fees are pending newly
• number of students there fees are pending from a month
• number of students there fees are paid 
• than moves to API calls for generating amount of every message, according to reading each row, and which student name have to mention with which parent name, and the tone. The system display file (in update file) as row and editable excel. Not generic code style format. The HTML is structured, backend needs to show the file in formated way with accurate numbers, names, rows according the the excel had really.


---------
**2. Backend Excel De-duplicate Uploading & Updating Logic.**

When user uploads same file with little modifications (one change amount of fee, pending or update), the system accepts. But it do not multiply any kind of same row, name and fee detection. It only changes the new row detected amount. System is smart, and can know what, where and when have to change. No one can exploit it with uploading more files, expecting amounts changes. Although the system supports the inline file updating feature, and saving it will also do changes at system level, backend, in xlsx file, resulting really numbers change and the new messages being generated.

Changes happens really, in that file. Therefore most of time user don't need to upload new files. Adding row is a feature, that is also possible.

---------

**3. Backend LLM messages generation tone and logic.**

Here is the proper tone and messaging logic.

Tone for messages generation while calling LLM API:

1. Newly Pending — Kind: Generate a warm, polite, and understanding fee reminder that gently informs the parent about the newly outstanding school fee. Use friendly, non-accusatory language, clearly mention the pending amount and due date, and provide the configured payment link. Assume the delay may be unintentional. Keep the message brief, reassuring, respectful, and focused on making payment convenient without creating pressure or embarrassment.

2. Pending for 1 Month — Normal: Generate a professional, courteous reminder acknowledging that the school fee has remained unpaid for approximately one month. Clearly state the outstanding amount, original due date, and configured payment link. Encourage the parent to complete payment promptly while maintaining a cooperative tone. Avoid blame, excessive friendliness, or unnecessary urgency. Keep the message concise, factual, respectful, and focused on timely fee settlement.

3. Pending for 2 Months — Slightly Strict: Generate a firm but courteous reminder highlighting that the school fee has remained outstanding for approximately two months. Emphasize the importance of settling the dues promptly and clearly mention the pending amount, due date, and configured payment link. Request immediate attention without sounding hostile. Maintain professional language, avoid accusations, and communicate that further delay should be avoided while preserving a respectful relationship with the parent.

4. Pending for 3 Months — Strict: Generate a formal, noticeably firm reminder emphasizing that the school fee has remained unpaid for approximately three months and requires urgent attention. Clearly state the outstanding amount, original due date, and configured payment link. Request that the parent arrange payment promptly or contact the school office if assistance or clarification is needed. Avoid threats, humiliation, aggressive wording, or unsupported consequences. Keep the message direct, professional, and focused on resolution.

5. Pending for 4 Months or More — Highly Strict: Generate a strongly worded, formal fee recovery reminder emphasizing the prolonged outstanding balance and the urgent need for resolution. State the pending amount, relevant due date, and configured payment link, and request immediate payment or prompt communication with the school administration to discuss the situation. Use decisive, unambiguous language without insults, intimidation, threats, public shaming, or fabricated penalties. Maintain professional dignity while making the seriousness of the continued delay unmistakable.

Backend consistency rule: Pass the actual number of overdue days, pending amount, due date, school name, and configured payment link as structured inputs. The LLM must not invent payment details, penalties, deadlines, or consequences, and the tone must escalate with overdue duration—not become abusive.

The API call contains all student name, parent names, due dates, pending time, that the response must create accurate messages, and formated one by one in messages section. Every message is only 30 to 50 words long with payment link. No larger than 50 words.



---------
**4. De-duplication for same day same person messaging system.**

De-duplicate same day same person messaging.
For suppose an excel upload, update happens, even a small modification, so on that say, the sent messages stay as it is. Only the newly edited, added or fee amount changed will generate a new message.

Only that new change will appear with API call new generated message, not all on same day.

Example 2: 

11 oct, 2026 ➜ all messages sent.
11 oct, 2026 ➜ one student fee amount modification ➜ one new message for it with clarification ➜ one message sent.
12 oct, 2026 ➜ again all messages for same people, sent.

New date will allow user to start campaign for all. This is an hard limit, for not bypassing WA business API limit (don't expose it with any direct mentions).

Bring one toast when this happens:

"Only newly modified messages will be ready to send. A full-scale mass campaign, like the one conducted previously, will begin tomorrow. Sending the same message on the same day is not allowed."

Toast theme: black label and white text in light mode,
White label and black text in dark mode. cross SVG applies same. Stays 15 seconds max than itself disappear.

---------
**5. Backend web-hook payment activation logic.**

Edsora: Razorpay Payment Integration

Price: ₹2,499/month.

Integrate Razorpay Checkout with a secure backend and webhook. Preserve the existing UI, design, paywall, and all unrelated functionality.

1. Before Payment

- Require Google sign-in before purchasing.
- Keep the existing Pro paywall and its six delivery benefits.
- Allow users to preview the Demo Excel without purchasing.
- Keep Pro-only actions locked until payment is verified.
- When the user taps "Get Pro Plan", create a ₹2,499 INR payment order through the backend and open Razorpay Checkout.
- Never activate Pro merely because the user clicks a button or returns from Checkout.

2. After Successful Payment

- Verify the payment on the backend using Razorpay's API.
- Verify webhook signatures using the raw request body and Razorpay webhook secret.
- Process "payment.captured" and/or the appropriate verified order-payment event.
- Confirm the order ID, payment ID, amount (249900 paise), INR currency, and authenticated user's identity.
- Activate the user's Pro subscription only after verified payment.
- Save the payment record and subscription status in the database.
- Unlock the existing Pro features and show a payment-success message.
- Make webhook processing idempotent so duplicate events never activate duplicate subscriptions.

3. Failed Payment / Cancellation

- Keep the account on Free.
- Keep Pro features locked.
- Show an appropriate payment-failed or cancelled message.
- Allow the user to retry payment.

4. Security

- Store Razorpay secret keys and webhook secrets only on the backend.
- Never trust frontend payment-success messages as proof of payment.
- Verify webhook signatures and payment status before granting access.
- Use a persistent database for payment records and subscription status.
- Do not use localStorage or "Auth.setPlan('pro')" as payment verification.

5. Existing Code

- Replace the current "#pwPro" click handler that directly activates Pro.
- Connect the existing paywall to the actual checkout flow.
- Preserve Google authentication, Demo Excel, existing delivery features, and current styling.
- Ensure Pro access remains active only while the subscription is valid. Handle subscription renewals, failures, expiry, and refunds through the appropriate verified payment events.
- Do not mark the integration complete until the full payment flow has been tested.

Edsora's current delivery bundle
Your existing paywall lists these six benefits at ₹2,499/month. 

✓ Daily Automated Messages + Accuracy
✓ Data Privacy For Institute System
✓ Up to 10K CSV File Names & Data
✓ Future updates for CSV/Excel files
✓ All future upgrades at no extra cost
✓ Four admin accounts in one plan

Before payment: Google sign-in is required for protected actions. The app has a Demo Excel flow, while uploading files, updating features, and starting the reminder system pass through Pro-access checks. The system also requires the user to configure their payment link before starting the reminder campaign.

One existing issue to fix: The #pwPro button currently calls Auth.setPlan('pro') directly. That is a simulated frontend activation, not a verified payment. Remove this shortcut and make the backend's verified subscription status the source of truth.

Remember price is ₹2499 per month.

---------
6. Backend days count for subscription logic

The google account icon on top right corner, have an black thin ring in light mode and white ring in dark mode, surrounding the cricle symbol with a slight gap exactly, this ring shows the days subscription is remaining (although autopay will ofcourse reset the ring), the days remaining to subscribe again or subscription triggering auto cut again. The subscription cut off on a 29 days of cycle, where first day the ring is complete, till the 28th day come it will deducted just a few from it's top.

Use the device's real-time system clock and automatically detect its timezone using JavaScript's "Date()" and "Intl.DateTimeFormat().resolvedOptions().timeZone". Keep the displayed date and time continuously updated. For server-side accuracy, synchronize with a trusted time source using backend UTC time and convert it to the user's local timezone. Handle timezone changes and daylight-saving adjustments automatically. Never hardcode dates, times, or timezone offsets.

Best logic: JavaScript for live display + backend UTC for authoritative timestamps. This keeps the app's date and time accurate without manually updating anything.

---------
7. De-duplication for same person in new file in numerical data dashboard

Thw numerical data dashboard also follow logic of students De-duplication, defected amounts of pending and paid and shows the actual numbers of excel uploaded.

The scheduled reminders follow same live numbers, after all sent it remains zero. Any interruptions, abort or cancel the campaign have option to start exactly from where choose to abort.

A toast popover on top for:
"Resume Campaign"

Where Resume is bold and underlined, functional when tapped it can resume the flow from where interrupted, not from full start.

Toast theme: black label and white text in light mode,
White label and black text in dark mode. cross SVG applies same. Stays 15 seconds max than itself disappear.


---------
8. Backend logic for referral link + seats to activate premium plan + web app admin role

?ref=premiumseat

With joining an 1,2,3,4,5,6...

Is an referral link generated by system. One paid subscription only generates truly accessable ?ref=premium1 (or any number at last), link.

For example:

1. ?ref=premium1
2. ?ref=premium2
3. ?ref=premium3
4. ?ref=premium4

In one premium account, user can share these because he tapped on SVG of seat and generated.

Until and unless any user, not generate an ?ref=premium5, that page will not access any premium access. And ?ref=premium5 (or more) is also not accessable for one subscription unlock. Only 4 are accessable.

Example 2:

One user taken all:

1. ?ref=premium1
2. ?ref=premium2
3. ?ref=premium3
4. ?ref=premium4

The system knows already these links are generated.

Now another user purchased premium.

So now links are:

1. ?ref=premium5
2. ?ref=premium6
3. ?ref=premium7
4. ?ref=premium8

Again 9th in ?ref=premium is not access able until any another user purchase premium and unlock and share.

To prevent this, after the 'Grab!' Option at HTML level I built now add an option as for asking connecting the email of subscription active.

Meaning: just tapping on grab will now won't activate. The ?ref=premium link needs an email verification. System knows which link is generated by which email, so accessing the email will as to input same email of subscription buyer, to put, verify, in bar, and tap on 'Connect & Unlock' than system will verify it's correct or not. Not correct email brings top toasts:

"This email doesn't match your subscription buyer's email. Please try again."

Premium Unlocked toast appears after verification succeed with correct email.

Toast theme: black label and white text in light mode,
White label and black text in dark mode. cross SVG applies same. Stays 10 seconds max than itself disappear.

After 4 people typed same email, the seats quota will full.

Overall an strong system with ?ref=premium links + email verification for premium unlock with seats.

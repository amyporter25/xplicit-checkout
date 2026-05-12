# Xplicit Checkout — Setup Guide

A two-step lead capture funnel for Xplicit Fitness:

1. **Step 1** (`index.html`) — Lead enters name, email, phone. Contact is created in GoHighLevel and tagged `step 1 form`.
2. **Step 2** (`step2.html`) — Lead clicks Pay and is redirected to Stripe-hosted Checkout for the $29 one-time charge.
3. **Webhook** — When Stripe confirms payment, the same contact gets tagged `step 2 form` in GHL, which triggers your post-purchase automations.

Both tags trigger workflows in the GoHighLevel sub-account.

---

## File map

```
xplicit-checkout/
├── index.html                       Step 1: lead capture form
├── step2.html                       Step 2: order summary + Pay button
├── success.html                     Post-payment thank-you page
├── api/
│   ├── create-lead.js               Creates the GHL contact, adds "step 1 form" tag
│   ├── create-checkout-session.js   Creates the Stripe Checkout session
│   └── stripe-webhook.js            Receives Stripe events, adds "step 2 form" tag
├── package.json                     Node dependencies (just the Stripe SDK)
├── .env.example                     Template for all required env vars
├── .gitignore
└── README.md                        This file
```

---

## What you'll need before you start

Gather these so you can paste them into Vercel later:

**From GoHighLevel (sub-account, not agency):**
- **Private Integration token.** In the sub-account: *Settings → Private Integrations → Create.* Grant scopes:
  - `contacts.write`
  - `contacts.readonly`
  - `contacts/tags.write` (or whatever tag-related scope is shown — needed to add tags)
- **Location ID.** *Settings → Business Profile → Location ID.*
- **The two tags** must exist (or will be auto-created when the API uses them, but it's cleaner to make them first):
  - `step 1 form`
  - `step 2 form`

**From Stripe:**
- **Secret key.** *Developers → API keys → Secret key.* Use the **test mode** one until you're ready to go live.
- **(Later) Webhook signing secret.** You'll create this after the first Vercel deploy, since you need the live URL first.

**Other:**
- A GitHub account.
- A Vercel account (free tier is plenty).

---

## Step-by-step deployment

### 1. Get the code on GitHub

The easiest path if you're not a developer:

1. Go to [github.com/new](https://github.com/new), create a new private repo called `xplicit-checkout`. Don't add a README — the project already has one.
2. On the next screen, click **uploading an existing file**.
3. Drag in every file from this folder (`index.html`, `step2.html`, `success.html`, the `api` folder, `package.json`, `.gitignore`, `.env.example`, `README.md`). **Do NOT upload `node_modules` if you happen to have one — `.gitignore` will skip it anyway.**
4. Commit.

### 2. Connect Vercel to the repo

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub.
2. Import the `xplicit-checkout` repo.
3. On the configure screen, leave the framework as **Other** (this is a static site with API routes — Vercel auto-detects). Don't change the build command.
4. **Before clicking Deploy**, expand "Environment Variables" and add all of these:

   | Key | Value | Notes |
   |---|---|---|
   | `GHL_API_KEY` | (your GHL Private Integration token) | |
   | `GHL_LOCATION_ID` | (sub-account Location ID) | |
   | `GHL_TAG_STEP_1` | `step 1 form` | Lowercase, with spaces — must match what your GHL workflow listens for |
   | `GHL_TAG_STEP_2` | `step 2 form` | Same — must match the workflow trigger exactly |
   | `STRIPE_SECRET_KEY` | (Stripe test secret key, `sk_test_...`) | Swap to `sk_live_...` when going live |
   | `STRIPE_WEBHOOK_SECRET` | Leave blank for now | We'll fill this in after the first deploy |
   | `PRODUCT_NAME` | `10-Class Pack` | Shows on Stripe Checkout page |
   | `PRODUCT_AMOUNT` | `2900` | In cents. $29.00 = 2900 |
   | `PRODUCT_CURRENCY` | `usd` | |
   | `PUBLIC_BASE_URL` | Leave blank for now | We'll fill this in after the first deploy |

5. Click **Deploy**. Wait ~30 seconds.
6. Once it's live, copy the URL Vercel gives you (something like `https://xplicit-checkout.vercel.app`).

### 3. Fill in the two env vars you skipped

1. Back in Vercel → **Settings → Environment Variables.**
2. Set `PUBLIC_BASE_URL` to the URL from step 2.6 (no trailing slash).
3. We'll set `STRIPE_WEBHOOK_SECRET` in the next step.

### 4. Register the Stripe webhook

1. In Stripe Dashboard → **Developers → Webhooks → Add endpoint.**
2. **Endpoint URL:** `https://your-vercel-url.vercel.app/api/stripe-webhook` (use the URL from step 2.6).
3. **Events to send:** just `checkout.session.completed`. (You can add more later, like `charge.refunded`, if you want to push refund tags to GHL too.)
4. Click **Add endpoint.**
5. On the endpoint page, click **Reveal** under "Signing secret" and copy the `whsec_...` value.
6. Back in Vercel → **Settings → Environment Variables** → set `STRIPE_WEBHOOK_SECRET` to that value.
7. In Vercel, redeploy (Deployments → latest → ⋯ → Redeploy) so the new env var is picked up.

### 5. Build the two GHL workflows

In the GoHighLevel sub-account:

- **Workflow A:** Trigger = "Contact Tag (added)" → Tag = `step 1 form`.
  → Whatever you want to happen when someone fills out Step 1 but hasn't paid yet (e.g., abandon-cart SMS sequence, confirmation email, "still thinking about it?" follow-up in 24h).

- **Workflow B:** Trigger = "Contact Tag (added)" → Tag = `step 2 form`.
  → Post-purchase flow: welcome SMS, scheduling link, internal notification to staff to call them, etc.

Activate both workflows.

### 6. End-to-end test (in Stripe test mode)

1. Visit your live Vercel URL.
2. Fill out Step 1 with a test email/phone you control.
3. Confirm a new contact appears in GHL with the `step 1 form` tag, and Workflow A fires.
4. On Step 2, click Pay. Stripe Checkout opens.
5. Use Stripe's test card: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
6. After payment, you should land on the success page.
7. Confirm the same GHL contact now also has the `step 2 form` tag, and Workflow B fires.

If something doesn't fire, check Vercel → **Deployments → (latest) → Functions → Logs** for errors. The functions log to `console.error` with descriptive messages.

### 7. Go live

When everything works in test mode:

1. Swap `STRIPE_SECRET_KEY` to your **live** key (`sk_live_...`).
2. Add a **second** webhook endpoint in Stripe — this time in *Live mode* (toggle at top of dashboard) — pointing to the same `/api/stripe-webhook` URL.
3. Copy that live webhook's signing secret and update `STRIPE_WEBHOOK_SECRET` in Vercel.
4. Redeploy.
5. Do one real $29 transaction to confirm everything works end-to-end, then refund yourself in Stripe.

---

## Custom domain (optional)

To use a domain like `join.xplicitfit.com` instead of the `.vercel.app` URL:

1. In Vercel → **Settings → Domains** → Add your domain.
2. Follow Vercel's DNS instructions (typically a CNAME record at your domain registrar).
3. Once it's live, update `PUBLIC_BASE_URL` in Vercel env vars to the new domain.
4. Update the Stripe webhook endpoint URL to use the new domain.
5. Redeploy.

---

## How the data flows (quick reference)

```
Browser (index.html)
    │  POST /api/create-lead {name, email, phone}
    ▼
Vercel function create-lead.js
    │  POST https://services.leadconnectorhq.com/contacts/upsert
    ▼
GoHighLevel    →  Workflow A fires on "step 1 form" tag
    │
    │  returns { contactId }
    ▼
Browser stores contactId in sessionStorage → loads step2.html
    │  POST /api/create-checkout-session {contactId}
    ▼
Vercel function create-checkout-session.js
    │  Stripe API: create Checkout Session with metadata.ghl_contact_id
    │  returns { url }
    ▼
Browser redirects to Stripe-hosted checkout page
    │  user pays
    ▼
Stripe sends checkout.session.completed event
    │
    ▼
Vercel function stripe-webhook.js (verifies signature)
    │  POST https://services.leadconnectorhq.com/contacts/{id}/tags
    ▼
GoHighLevel    →  Workflow B fires on "step 2 form" tag
    │
    ▼
Browser lands on success.html
```

---

## Troubleshooting

**Step 1 form just spins forever.** Open the browser dev tools (right-click → Inspect → Console) and look for an error. Most common: `GHL_API_KEY` or `GHL_LOCATION_ID` is missing or has a typo in Vercel env vars. After fixing, redeploy.

**Step 2 says "Please start at Step 1."** That means `sessionStorage` was cleared (e.g., the user opened step2.html directly in a new tab/incognito). Expected behavior — the script will redirect them back to Step 1.

**Stripe Checkout opens but redirects to a broken URL after payment.** Your `PUBLIC_BASE_URL` env var is wrong or has a trailing slash. Should be exactly `https://xplicit-checkout.vercel.app` with no trailing `/`.

**Contact gets `step 1 form` tag but never `step 2 form`.** The Stripe webhook isn't reaching your function. In Stripe → Webhooks → click your endpoint → look at recent delivery attempts. If they're failing with 400, your `STRIPE_WEBHOOK_SECRET` is wrong. If they're failing with 500, check the Vercel function logs — most likely a GHL API error.

**Tag doesn't trigger the GHL workflow.** The tag name must match *exactly* (including case and spaces). GHL is fussy. Confirm the workflow trigger is set to "Tag (added)" with the exact string `step 1 form` or `step 2 form`.

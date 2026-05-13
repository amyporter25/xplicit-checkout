// Vercel serverless function: POST /api/stripe-webhook
// Stripe calls this URL when events happen (checkout completed, payment failed, refund, etc.).
// On checkout.session.completed we add the "step 2 form" tag to the matching GHL contact.
//
// Required env vars:
//   STRIPE_SECRET_KEY            sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET        whsec_... (created in Stripe Dashboard after first deploy)
//   GHL_API_KEY                  GHL Private Integration token
//   GHL_LOCATION_ID              GHL sub-account Location ID
// Optional:
//   GHL_TAG_STEP_2               tag name; defaults to "step 2 form"

const Stripe = require('stripe');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function addTagToContact(contactId, tagName) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !contactId) return;

  const response = await fetch(`${GHL_API_BASE}/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ tags: [tagName] })
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('GHL add-tag failed', response.status, text);
    throw new Error(`GHL add-tag failed: ${response.status}`);
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method not allowed');
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const tagName = process.env.GHL_TAG_STEP_2 || 'step 2 form';

  if (!stripeKey || !webhookSecret) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET env vars');
    return res.status(500).end('Server not configured');
  }

  const stripe = Stripe(stripeKey);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe signature verification failed', err.message);
    return res.status(400).end(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const contactId = (session.metadata && session.metadata.ghl_contact_id) || null;
      if (contactId) {
        await addTagToContact(contactId, tagName);
        console.log(`Tagged GHL contact ${contactId} with "${tagName}"`);
      } else {
        console.warn('checkout.session.completed had no ghl_contact_id in metadata', session.id);
      }
    } else {
      console.log('Ignoring Stripe event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('webhook handler error', err);
    // Return 500 so Stripe retries the delivery.
    return res.status(500).end('Webhook handler failed');
  }
}

// Tell Vercel NOT to parse the body — Stripe needs the raw bytes to verify the signature.
handler.config = { api: { bodyParser: false } };

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };

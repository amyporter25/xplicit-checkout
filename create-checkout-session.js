// Vercel serverless function: POST /api/create-checkout-session
// Creates a one-time Stripe Checkout session for the $29 / 10-class pack.
// Stores the GHL contactId in session metadata so the webhook can tag the contact after payment.
// Returns { url } — the browser then redirects to Stripe.
//
// Required env vars:
//   STRIPE_SECRET_KEY   sk_test_... or sk_live_...
//   PUBLIC_BASE_URL     e.g. https://your-domain.vercel.app  (used for success/cancel redirects)
// Optional env vars:
//   PRODUCT_NAME        defaults to "10-Class Pack"
//   PRODUCT_AMOUNT      price in cents, defaults to 2900 ($29.00)
//   PRODUCT_CURRENCY    defaults to "usd"

const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!stripeKey || !baseUrl) {
    console.error('Missing STRIPE_SECRET_KEY or PUBLIC_BASE_URL env vars');
    return res.status(500).json({ error: 'Server is not configured. Please contact the site owner.' });
  }

  const productName = process.env.PRODUCT_NAME || '10-Class Pack';
  const productAmount = parseInt(process.env.PRODUCT_AMOUNT, 10) || 2900; // cents
  const productCurrency = (process.env.PRODUCT_CURRENCY || 'usd').toLowerCase();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const contactId = typeof body.contactId === 'string' ? body.contactId.trim() : '';
  const customerEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!contactId) {
    return res.status(400).json({ error: 'Missing contactId. Please start at Step 1.' });
  }

  try {
    const stripe = Stripe(stripeKey);
    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: productCurrency,
            product_data: { name: productName },
            unit_amount: productAmount
          },
          quantity: 1
        }
      ],
      // Critical: pass contactId through Stripe so the webhook can match the payment back to the GHL contact.
      metadata: { ghl_contact_id: contactId },
      payment_intent_data: {
        metadata: { ghl_contact_id: contactId }
      },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/step2.html`,
      allow_promotion_codes: false
    };
    if (customerEmail && /^\S+@\S+\.\S+$/.test(customerEmail)) {
      sessionParams.customer_email = customerEmail;
    }
    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err && err.message);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
};

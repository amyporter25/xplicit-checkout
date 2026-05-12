// Vercel serverless function: POST /api/create-lead
// Receives { name, email, phone } from Step 1.
// Creates (or upserts) a contact in the GHL sub-account and tags it "step 1 form".
// Returns { contactId } so the browser can hand it off to Step 2.
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   GHL_API_KEY      Private Integration token from the sub-account
//   GHL_LOCATION_ID  The sub-account's Location ID
//   GHL_TAG_STEP_1   (optional) tag name; defaults to "step 1 form"

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const tagName = process.env.GHL_TAG_STEP_1 || 'step 1 form';

  if (!apiKey || !locationId) {
    console.error('Missing GHL_API_KEY or GHL_LOCATION_ID env vars');
    return res.status(500).json({ error: 'Server is not configured. Please contact the site owner.' });
  }

  // Vercel parses JSON bodies by default, but be defensive.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'Name, email, and phone are all required.' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'That email looks invalid.' });
  }

  try {
    // Use the upsert endpoint so re-submitting the same email/phone updates
    // the existing contact instead of erroring on duplicate.
    const upsertRes = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: GHL_API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        locationId: locationId,
        firstName: name,
        email: email,
        phone: phone,
        tags: [tagName],
        source: 'Website - Step 1 Form'
      })
    });

    const upsertText = await upsertRes.text();
    let upsertData;
    try { upsertData = JSON.parse(upsertText); } catch (e) { upsertData = { raw: upsertText }; }

    if (!upsertRes.ok) {
      console.error('GHL upsert failed', upsertRes.status, upsertData);
      return res.status(502).json({ error: 'We could not save your info. Please try again or call us.' });
    }

    // GHL responses can shape the contact as { contact: {...} } or { id, ... } depending on endpoint.
    const contact = upsertData.contact || upsertData;
    const contactId = contact && (contact.id || contact._id);

    if (!contactId) {
      console.error('GHL upsert returned no contact id', upsertData);
      return res.status(502).json({ error: 'We could not save your info. Please try again.' });
    }

    return res.status(200).json({ contactId: contactId });
  } catch (err) {
    console.error('create-lead error', err);
    return res.status(500).json({ error: 'Unexpected error. Please try again.' });
  }
};

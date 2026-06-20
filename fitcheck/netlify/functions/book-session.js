// netlify/functions/book-session.js
//
// Writes a booking request to Supabase. Requires SUPABASE_URL and
// SUPABASE_SERVICE_KEY set in Netlify environment variables.
// Table schema: see supabase-schema.sql in project root.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server not configured: missing Supabase env vars" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { name, phone, email, date, notes, service, price } = body;

  if (!name || !phone || !email || !service) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify([
        {
          name,
          phone,
          email,
          preferred_date: date || null,
          notes: notes || null,
          service,
          price_quote: price || null,
          status: "pending",
        },
      ]),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Supabase insert error:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Could not save booking" }) };
    }

    // Optional: trigger an email/WhatsApp notification to Olawale here
    // via Resend or a webhook, once those env vars are wired up.

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("book-session error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};

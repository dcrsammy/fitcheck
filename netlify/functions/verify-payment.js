// netlify/functions/verify-payment.js
//
// Verifies a Paystack transaction reference, then sets the user's
// plan ('pro' | 'closet') and expiry in Supabase. Requires
// PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { reference, userId, plan, billing } = body; // plan: "pro" | "closet", billing: "monthly" | "yearly"
  if (!reference || !userId || !["pro", "closet"].includes(plan)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid reference/userId/plan" }) };
  }

  try {
    // 1. Verify the transaction with Paystack
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== "success") {
      return { statusCode: 400, body: JSON.stringify({ error: "Payment not verified" }) };
    }

    // 2. Calculate expiry
    const now = new Date();
    const expires = new Date(now);
    if (billing === "yearly") {
      expires.setFullYear(expires.getFullYear() + 1);
    } else {
      expires.setMonth(expires.getMonth() + 1);
    }

    // 3. Update the profile in Supabase
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        plan: plan,
        plan_expires_at: expires.toISOString(),
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error("Supabase update error:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Could not activate plan" }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, plan, expiresAt: expires.toISOString() }),
    };
  } catch (err) {
    console.error("verify-payment error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};

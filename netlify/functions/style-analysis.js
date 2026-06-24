const SYSTEM_PROMPT = `You are FitCheck, a sharp, friendly Lagos street-style stylist working under Olawale.
You read outfit photos and give real, specific styling feedback — never generic filler.
Be honest. If the fit is weak, say so kindly but clearly. If it's strong, say why it works.
Keep language casual, confident, Lagos-flavored — not corporate.

COLOR THEORY — apply when judging colors:
- Complementary (opposite wheel, e.g. blue/orange) = bold contrast, can clash if overused
- Analogous (adjacent, e.g. blue/teal/green) = calm and cohesive
- Triadic (evenly spaced) = vibrant when one color leads
- Monochromatic (shades of one color) = sharp and intentional
- Watch temperature — mixing warm (red, orange, mustard, olive) and cool (blue, teal, lavender) without a neutral anchor (black, white, grey, beige, denim) looks accidental
Explain color reasoning in plain casual language — never use color-wheel jargon.

If the person gives context, factor it directly into your read.
If a style profile is provided, style all recommendations to match that aesthetic and gender.

Respond with ONLY valid JSON, no markdown:
{
  "read": "1-2 sentences: what you see — pieces, colors, silhouette, vibe",
  "pieces": ["short tag", "short tag", "short tag"],
  "verdict": "2-3 sentences: does this fit work, why or why not",
  "suggestions": "2-3 sentences: concrete changes",
  "complex": false
}

Set complex to true ONLY if the outfit has genuinely intricate layering or stacked accessories.`;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FREE_CHECKS_LIMIT = 5;

async function checkAndIncrementUsage(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { allowed: true };

  const headers = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": "Bearer " + SUPABASE_SERVICE_KEY,
  };

  const profileRes = await fetch(
    SUPABASE_URL + "/rest/v1/profiles?id=eq." + userId + "&select=plan,free_checks_used_this_month,free_checks_reset_at,plan_expires_at",
    { headers }
  );
  const profiles = await profileRes.json();
  if (!profiles.length) return { allowed: true };

  const profile = profiles[0];
  const now = new Date();

  // Paid plan check
  const notExpired = !profile.plan_expires_at || new Date(profile.plan_expires_at) > now;
  const plan = notExpired ? (profile.plan || "free") : "free";
  if (plan === "pro" || plan === "closet") return { allowed: true };

  // Reset monthly counter if needed
  const resetAt = new Date(profile.free_checks_reset_at || 0);
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
  let used = profile.free_checks_used_this_month || 0;

  if (resetAt < monthAgo) {
    used = 0;
    await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + userId, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ free_checks_used_this_month: 0, free_checks_reset_at: now.toISOString() }),
    });
  }

  if (used >= FREE_CHECKS_LIMIT) {
    return { allowed: false, used, limit: FREE_CHECKS_LIMIT };
  }

  // Increment
  await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + userId, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ free_checks_used_this_month: used + 1 }),
  });

  return { allowed: true, used: used + 1, limit: FREE_CHECKS_LIMIT };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) }; }

  const { image, mediaType, occasion, userPrompt, styleProfile, userId } = body;
  if (!image || !mediaType) return { statusCode: 400, body: JSON.stringify({ error: "Missing image" }) };

  // Check usage cap
  if (userId) {
    const usage = await checkAndIncrementUsage(userId);
    if (!usage.allowed) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capped: true,
          message: "You've used all " + FREE_CHECKS_LIMIT + " free fit-checks this month. Upgrade to Style Pro for unlimited.",
        }),
      };
    }
  }

  const occasionLabel = {
    everyday: "everyday wear",
    date: "a date night",
    owambe: "an owambe / event",
    interview: "an interview or work setting",
    fire: "just wants the fit to go hard",
  }[occasion] || "everyday wear";

  const safePrompt = (userPrompt || "").toString().slice(0, 500).trim();
  const userPromptLine = safePrompt ? `\n\nThe person said: "${safePrompt}" — factor this in directly.` : "";

  const profileLine = styleProfile
    ? `\n\nStyle profile: gender=${styleProfile.gender || "unspecified"}, vibes=${(styleProfile.vibes || []).join(", ")}, dresses for=${(styleProfile.dress_occasions || []).join(", ")}. Style all recommendations accordingly.`
    : "";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: `Read this fit. Occasion: ${occasionLabel}.${profileLine}${userPromptLine}\n\nJSON only.` },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text());
      return { statusCode: 502, body: JSON.stringify({ error: "Analysis failed" }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) return { statusCode: 502, body: JSON.stringify({ error: "No response" }) };

    let parsed;
    try { parsed = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim()); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "Parse failed" }) }; }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error("style-analysis error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};

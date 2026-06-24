// netlify/functions/plan-week.js
//
// Takes the user's full wardrobe metadata and occasion preferences,
// returns 7 outfit combinations using only items from the wardrobe.
// No images sent — only tagged metadata. Requires ANTHROPIC_API_KEY.

const SYSTEM_PROMPT = `You are FitCheck, a Lagos street-style stylist.
You are given a user's wardrobe as a list of tagged clothing items, and their occasion
preferences for each day of the week.

Your job is to plan complete outfits for each day using ONLY items from the wardrobe provided.

RULES:
- Each item can only be used ONCE across the entire week (no repeats)
- Every outfit must have at least a top and a bottom
- Add shoes if available, outerwear if weather/occasion suits, accessories if available
- If you run out of variety, plan fewer days rather than repeat items
- Match color theory: complementary, analogous, or monochromatic combos work best
- Match the occasion: work = cleaner/structured, casual = relaxed, evening = elevated

Respond with ONLY valid JSON, no markdown, exactly this shape:
{
  "monday": {
    "items": ["item_id_1", "item_id_2"],
    "note": "one short sentence about this outfit vibe"
  },
  "tuesday": { ... },
  "wednesday": { ... },
  "thursday": { ... },
  "friday": { ... },
  "saturday": { ... },
  "sunday": { ... }
}

If a day cannot be planned (not enough items), set it to null:
"sunday": null

Use the exact item IDs provided in the wardrobe list. Do not invent IDs.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { wardrobe, occasions } = body;
  if (!wardrobe || !wardrobe.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "No wardrobe items provided" }) };
  }

  const wardrobeText = wardrobe
    .map((it) => `ID: ${it.id} | ${it.category} | ${it.color} | ${it.description || ""} | tags: ${(it.tags || []).join(", ")}`)
    .join("\n");

  const occasionsText = Object.entries(occasions || {})
    .map(([day, occ]) => `${day}: ${occ}`)
    .join("\n");

  const userMessage = `Here is the wardrobe:\n${wardrobeText}\n\nOccasion preferences:\n${occasionsText}\n\nPlan the week. Use exact item IDs. Respond with JSON only.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Planning failed" }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      return { statusCode: 502, body: JSON.stringify({ error: "No response from AI" }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim());
    } catch (e) {
      console.error("Failed to parse plan JSON:", textBlock.text);
      return { statusCode: 502, body: JSON.stringify({ error: "Couldn't parse plan" }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    console.error("plan-week error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};

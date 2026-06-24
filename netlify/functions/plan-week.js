// netlify/functions/plan-week.js

const SYSTEM_PROMPT = `You are FitCheck, a Lagos street-style stylist.
You are given a user's wardrobe as tagged clothing items and their occasion
preferences for each day of the week.

Your job is to plan complete outfits for each day using items from the wardrobe.

RULES:
- Every outfit must have at least a top and a bottom
- Individual pieces CAN repeat across days (a person owns limited clothes)
- But no two days should have the exact same full outfit combination
- Add shoes if available, outerwear if occasion suits, accessories if available
- Match color theory: complementary, analogous, or monochromatic combos work best
- Match the occasion: work = cleaner/structured, casual = relaxed, evening = elevated
- The "note" field must be a short human-readable styling tip — never mention item IDs

Respond with ONLY valid JSON, no markdown, exactly this shape:
{
  "monday": {
    "items": ["item_id_1", "item_id_2"],
    "note": "one short sentence about this outfit vibe"
  },
  "tuesday": { "items": [...], "note": "..." },
  "wednesday": { "items": [...], "note": "..." },
  "thursday": { "items": [...], "note": "..." },
  "friday": { "items": [...], "note": "..." },
  "saturday": { "items": [...], "note": "..." },
  "sunday": { "items": [...], "note": "..." }
}

If a day genuinely cannot be planned (missing essential category like tops or bottoms),
set it to null. Do not mention item IDs anywhere in notes.
Use the exact item IDs provided. Do not invent IDs.`;

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

  const userMessage = `Wardrobe:\n${wardrobeText}\n\nOccasions:\n${occasionsText}\n\nPlan the week. Use exact item IDs. Never mention IDs in notes. JSON only.`;

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

    // Server-side: remove any days where note leaks an ID (UUID pattern)
    const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}/i;
    const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    DAYS.forEach((day) => {
      if (!parsed[day]) return;
      if (parsed[day].note && UUID_PATTERN.test(parsed[day].note)) {
        parsed[day].note = "A solid combo from your closet.";
      }
    });

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

const SYSTEM_PROMPT = `You are FitCheck, a Lagos street-style stylist.
You are given a user's wardrobe as tagged clothing items and their occasion
preferences for each day — up to TWO occasions per day (outfit1 and outfit2).

Your job is to plan complete outfits for each day using items from the wardrobe.

RULES:
- Every outfit must have at least a top and a bottom
- Individual pieces CAN repeat across days (limited wardrobe is normal)
- But no two days should have the exact same full outfit combination
- outfit1 and outfit2 on the same day should be clearly different
- Add shoes if available, outerwear if occasion suits, accessories if available
- Match color theory: complementary, analogous, or monochromatic combos work best
- Match the occasion:
  office = structured, clean, intentional
  home/lounge = relaxed, comfortable, still put-together
  casual = effortless everyday
  evening = elevated, night energy
  gym = functional, athletic
  event/owambe = bold, celebratory
  date = intentional, attractive
- If a style profile is provided, style all recommendations to match that aesthetic and gender
- Never mention item IDs in notes
- Keep each note to ONE short sentence maximum (under 15 words)
- Respond with raw JSON only — no markdown, no backticks, no code fences

Respond with ONLY valid JSON, no markdown, exactly this shape:
{
  "monday": {
    "outfit1": { "items": ["id1", "id2"], "note": "short styling note" },
    "outfit2": { "items": ["id3", "id4"], "note": "short styling note" }
  },
  "tuesday": { ... },
  "wednesday": { ... },
  "thursday": { ... },
  "friday": { ... },
  "saturday": { ... },
  "sunday": { ... }
}

If outfit2 occasion is null, set "outfit2": null for that day.
If a day cannot be planned at all, set the entire day to null.
Do not mention item IDs in notes. Use exact item IDs provided. Do not invent IDs.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) }; }

  const { wardrobe, occasions, styleProfile } = body;
  if (!wardrobe || !wardrobe.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "No wardrobe items" }) };
  }

  // Send minimal wardrobe data to reduce payload and response size
  const wardrobeText = wardrobe
    .map((it) => `${it.id}:${it.category}${it.subcategory ? "/" + it.subcategory : ""}:${it.color}`)
    .join("\n");

  const occasionsText = Object.entries(occasions || {})
    .map(([day, occ]) => `${day}:${occ.outfit1||"casual"}/${occ.outfit2||"none"}`)
    .join(",");

  const profileLine = styleProfile
    ? `User style profile: gender=${styleProfile.gender || "unspecified"}, vibes=${(styleProfile.vibes || []).join(", ")}, dresses for=${(styleProfile.dress_occasions || []).join(", ")}. Style all outfits accordingly.\n\n`
    : "";

  const userMessage = `${profileLine}Wardrobe (id:category:color):\n${wardrobeText}\n\nOccasions (day:outfit1/outfit2): ${occasionsText}\n\nPlan 2 outfits per day. Use exact IDs from wardrobe. Notes under 10 words. Raw JSON only.`;

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
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text());
      return { statusCode: 502, body: JSON.stringify({ error: "Planning failed" }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) return { statusCode: 502, body: JSON.stringify({ error: "No response" }) };

    let parsed;
    try { const cleaned = textBlock.text.replace(/```json/gi, "").replace(/```/g, "").replace(/^\s*json\s*/i, "").trim();
      parsed = JSON.parse(cleaned); }
    catch (e) {
      console.error("Parse failed:", textBlock.text);
      return { statusCode: 502, body: JSON.stringify({ error: "Couldn't parse plan" }) };
    }

    // Clean UUID leaks from notes
    const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}/i;
    const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    DAYS.forEach((day) => {
      if (!parsed[day]) return;
      ["outfit1","outfit2"].forEach((slot) => {
        if (!parsed[day][slot]) return;
        if (parsed[day][slot].note && UUID_PATTERN.test(parsed[day][slot].note)) {
          parsed[day][slot].note = "A solid combo from your closet.";
        }
      });
    });

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error("plan-week error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};

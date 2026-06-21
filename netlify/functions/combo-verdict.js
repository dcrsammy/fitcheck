// netlify/functions/combo-verdict.js
//
// Given a set of already-tagged wardrobe items, returns a styling verdict
// on how well they work together as an outfit, applying color theory.
// Requires ANTHROPIC_API_KEY.

const SYSTEM_PROMPT = `You are FitCheck, a sharp, friendly Lagos street-style stylist.
You're given a list of already-tagged clothing items someone has picked to wear together.
Judge the combination — does it work, why or why not, what would make it better.

COLOR THEORY — apply this when judging the combo:
- Complementary colors (opposite on the color wheel, e.g. blue/orange, red/green) create bold contrast — works for standout fits, can clash if every piece fights for attention.
- Analogous colors (next to each other, e.g. blue/teal/green) feel calm and cohesive.
- Triadic combos (three evenly spaced colors) feel vibrant when one color leads and the others accent.
- Monochromatic (shades of one color) reads sharp and intentional.
- Watch temperature — mixing warm tones (red, orange, mustard, olive) and cool tones (blue, teal, lavender) without a neutral anchor (black, white, grey, beige, denim) often looks accidental.
Explain your color reasoning in plain, casual language — never lecture with color-wheel jargon.

If the person added a note or question about the combo, answer it directly in your verdict.

Be honest, casual, Lagos-flavored. Not corporate.

Respond with ONLY valid JSON, no markdown, exactly this shape:
{
  "verdict": "2-3 sentences on whether this combo works and why",
  "rating": "fire" | "decent" | "needs work",
  "tweak": "1 sentence suggestion to improve it, or empty string if it's already great"
}`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured: missing ANTHROPIC_API_KEY" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { items, userPrompt } = body;
  if (!items || !Array.isArray(items) || items.length < 2) {
    return { statusCode: 400, body: JSON.stringify({ error: "Need at least 2 items" }) };
  }

  const itemsText = items
    .map((it, i) => `${i + 1}. ${it.category} — ${it.color}, ${it.description} (${(it.tags || []).join(", ")})`)
    .join("\n");

  const safeUserPrompt = (userPrompt || "").toString().slice(0, 300).trim();
  const userPromptLine = safeUserPrompt ? `\n\nThe person asked/noted: "${safeUserPrompt}" — answer this directly.` : "";

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
        max_tokens: 350,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Here's the combo:\n${itemsText}${userPromptLine}\n\nRespond with the JSON shape only.` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Combo check failed" }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      return { statusCode: 502, body: JSON.stringify({ error: "No response from styling engine" }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim());
    } catch (e) {
      console.error("Failed to parse model JSON:", textBlock.text);
      return { statusCode: 502, body: JSON.stringify({ error: "Couldn't parse result" }) };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error("combo-verdict error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};

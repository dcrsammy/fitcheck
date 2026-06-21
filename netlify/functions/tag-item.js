// netlify/functions/tag-item.js
//
// Tags a single garment photo — category, color, short tags, description.
// Accepts an optional user note for extra context. Requires
// ANTHROPIC_API_KEY in Netlify environment variables.

const SYSTEM_PROMPT = `You are a garment-tagging assistant for FitCheck, a Lagos styling app.
Look at ONE clothing item (or accessory/shoe) in the photo and identify it.

Apply basic color theory when describing the color — note if it's a warm tone (red, orange,
mustard, olive) or cool tone (blue, teal, lavender) or neutral (black, white, grey, beige, denim),
since this helps later when matching pieces into outfits.

If the person added a note about the item, factor it into your description where relevant.

Respond with ONLY valid JSON, no markdown, no preamble, exactly this shape:
{
  "category": "top" | "bottom" | "shoes" | "outerwear" | "accessory",
  "color": "short color name, e.g. olive, off-white, navy",
  "tags": ["short tag", "short tag", "short tag"],
  "description": "one short sentence describing the piece"
}

If multiple items are visible in one photo, describe the most prominent one only.
Keep tags concrete and useful for outfit-matching later, e.g. "oversized", "ribbed", "cargo", "high-top".`;

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

  const { image, mediaType, userPrompt } = body;
  if (!image || !mediaType) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing image" }) };
  }

  const safeUserPrompt = (userPrompt || "").toString().slice(0, 300).trim();
  const userPromptLine = safeUserPrompt ? `\n\nNote from the person: "${safeUserPrompt}"` : "";

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
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
              { type: "text", text: `Tag this item.${userPromptLine}\n\nRespond with the JSON shape only.` },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Tagging failed" }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      return { statusCode: 502, body: JSON.stringify({ error: "No response from tagging engine" }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim());
    } catch (e) {
      console.error("Failed to parse model JSON:", textBlock.text);
      return { statusCode: 502, body: JSON.stringify({ error: "Couldn't parse tagging result" }) };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error("tag-item error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};

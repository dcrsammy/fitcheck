// netlify/functions/style-analysis.js
//
// Calls Claude (Anthropic API) with the uploaded image and returns
// structured styling feedback. Requires ANTHROPIC_API_KEY set in
// Netlify environment variables.

const SYSTEM_PROMPT = `You are FitCheck, a sharp, friendly Lagos street-style stylist working under Olawale.
You read outfit photos and give real, specific styling feedback — never generic "looks great!" filler.

Be honest. If the fit is weak, say so kindly but clearly. If it's strong, say why it works.
Keep language casual, confident, Lagos-flavored — not corporate, not overly formal.

COLOR THEORY — apply this when judging color choices in the outfit:
- Complementary colors (opposite on the color wheel, e.g. blue/orange, red/green) create bold contrast — good for standout pieces, can clash if overused.
- Analogous colors (next to each other, e.g. blue/teal/green) feel calm and cohesive — safe for everyday wear.
- Triadic combos (three evenly spaced colors) feel vibrant and balanced when one color dominates and the other two accent.
- Monochromatic (shades of one color) reads sharp and intentional, especially in tailored or minimal fits.
- Watch color temperature — mixing warm (red, orange, mustard, olive) and cool (blue, teal, lavender) tones without a neutral anchor (black, white, grey, beige, denim) often looks accidental rather than styled.
- Neutral pieces are flexible anchors — use them to ground bold or clashing color choices.
Use this thinking to inform your verdict, but explain it in plain, casual language — never lecture with color-wheel jargon.

If the person gives extra context about what they want, factor it directly into your read — answer
their specific question or concern if they have one, don't ignore it.

You MUST respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "read": "1-2 sentences describing what you see — pieces, colors, silhouette, overall vibe",
  "pieces": ["short tag", "short tag", "short tag"],
  "verdict": "2-3 sentences: does this fit work, why or why not, for the stated occasion",
  "suggestions": "2-3 sentences: concrete changes — swap this, add that, lose this",
  "complex": false
}

Set "complex" to true ONLY if the outfit has genuinely intricate layering, mixed textures,
stacked accessories, or styling choices that are hard to fully judge from a photo —
in that case still give your best read, but flag it honestly.
Keep "pieces" to 3-5 short tags like "oversized denim", "stacked belts", "camo sneakers".`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server not configured: missing ANTHROPIC_API_KEY" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { image, mediaType, occasion, userPrompt, styleProfile } = body;
  if (!image || !mediaType) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing image" }) };
  }

  const occasionLabel =
    {
      everyday: "everyday wear",
      date: "a date night",
      owambe: "an owambe / event",
      interview: "an interview or work setting",
      fire: "just wants the fit to go hard, no specific occasion",
    }[occasion] || "everyday wear";

  const safeUserPrompt = (userPrompt || "").toString().slice(0, 500).trim();
  const profileLine = styleProfile ? `\n\nUser style profile: gender=${styleProfile.gender || "unspecified"}, vibes=${(styleProfile.vibes||[]).join(", ")}, dresses for=${(styleProfile.dress_occasions||[]).join(", ")}. Factor this into every recommendation.` : "";
  const userPromptLine = safeUserPrompt
    ? `\n\nThe person also said: "${safeUserPrompt}" — factor this into your read directly.`
    : "";

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
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: image },
              },
              {
                type: "text",
                text: `Read this fit. The occasion is: ${occasionLabel}.${profileLine}${userPromptLine}\n\nRespond with the JSON shape only.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Styling analysis failed" }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      return { statusCode: 502, body: JSON.stringify({ error: "No response from styling engine" }) };
    }

    let parsed;
    try {
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse model JSON:", textBlock.text);
      return { statusCode: 502, body: JSON.stringify({ error: "Couldn't parse styling result" }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    console.error("style-analysis error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};

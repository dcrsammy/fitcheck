// netlify/functions/style-analysis.js
//
// Calls Google Gemini (free tier) with the uploaded image and returns
// structured styling feedback. Requires GEMINI_API_KEY set in
// Netlify environment variables (Site settings > Environment variables).

const SYSTEM_PROMPT = `You are FitCheck, a sharp, friendly Lagos street-style stylist working under Olawale.
You read outfit photos and give real, specific styling feedback — never generic "looks great!" filler.

Be honest. If the fit is weak, say so kindly but clearly. If it's strong, say why it works.
Keep language casual, confident, Lagos-flavored — not corporate, not overly formal.

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server not configured: missing GEMINI_API_KEY" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { image, mediaType, occasion } = body;
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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mediaType, data: image } },
                {
                  text: `${SYSTEM_PROMPT}\n\nRead this fit. The occasion is: ${occasionLabel}. Respond with the JSON shape only.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Styling analysis failed" }) };
    }

    const data = await response.json();
    const textBlock = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textBlock) {
      console.error("Unexpected Gemini response shape:", JSON.stringify(data));
      return { statusCode: 502, body: JSON.stringify({ error: "No response from styling engine" }) };
    }

    let parsed;
    try {
      const cleaned = textBlock.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse model JSON:", textBlock);
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
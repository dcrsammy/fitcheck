const SYSTEM_PROMPT = `You are a garment-tagging assistant for FitCheck, a Lagos styling app.
Look at ONE clothing item (or accessory/shoe) in the photo and identify it precisely.

ACCURACY RULES:
- Only describe construction details you can actually see clearly
- Don't guess at zips, buttons, or closures if not visible — describe generically
- Describe what you see, not what's typical for that garment type

CATEGORY — pick exactly one:
top | bottom | shoes | outerwear | accessory

SUB-CATEGORY — pick the most accurate:
Tops: graphic-tee | polo | rugby-shirt | button-up | hoodie | sweatshirt | tank | crop-top | bodysuit | knit | jersey | vest
Bottoms: baggy-jeans | straight-jeans | wide-leg-trousers | cargo-pants | sweatpants | shorts | denim-shorts | cargo-shorts | maxi-skirt | mini-skirt | trousers
Shoes: chunky-sneakers | low-top-sneakers | boots | loafers | heels | sandals | slides | high-top-sneakers
Outerwear: bomber | varsity-jacket | leather-jacket | trench-coat | blazer | cardigan | denim-jacket | puffer
Accessory: chain | cap | sunglasses | belt | bag | watch | ring | earrings | bracelet | socks

COLOR — note if warm (red, orange, mustard, olive) cool (blue, teal, lavender) or neutral (black, white, grey, beige, denim).

Respond with ONLY valid JSON, no markdown:
{
  "category": "top",
  "subcategory": "graphic-tee",
  "color": "washed black",
  "tags": ["oversized", "graphic-print", "short-sleeve"],
  "description": "one short sentence describing only what is visible"
}

Keep tags to 3-5 short descriptors useful for outfit matching.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) }; }

  const { image, mediaType, userPrompt } = body;
  if (!image || !mediaType) return { statusCode: 400, body: JSON.stringify({ error: "Missing image" }) };

  const safePrompt = (userPrompt || "").toString().slice(0, 300).trim();
  const promptLine = safePrompt ? `\n\nNote from person: "${safePrompt}"` : "";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: `Tag this item.${promptLine}\n\nJSON only.` },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text());
      return { statusCode: 502, body: JSON.stringify({ error: "Tagging failed" }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) return { statusCode: 502, body: JSON.stringify({ error: "No response" }) };

    let parsed;
    try { parsed = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim()); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "Parse failed" }) }; }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error("tag-item error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};

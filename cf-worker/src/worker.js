export default {
  async fetch(request, env) {
    // --- Allow your dev origin. For now, "*" is fine in Codespaces. ---
    const origin = request.headers.get("Origin") || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin, // or "*" while testing
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    };

    // --- Preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    // --- Parse body ---
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { messages = [], contextMajors = [] } = body;

    // --- Grounding system prompt ---
    const system = {
      role: "system",
      content:
`You are ASU's Major Match assistant for undecided undergrads.
Only use the provided "Majors Context" and the user's message.
Recommend 3–6 majors. For each: show name (+ degree if present),
a one-line "why it fits", notable tags (campus/online), and a "Program page" link (from url).
If unsure, ask one short clarifying question.

Majors Context:
${contextMajors.map(m =>
  `- ${m.name}${m.degree ? " ("+m.degree+")" : ""}${m.college ? " — "+m.college : ""}. ${Array.isArray(m.tags)?m.tags.join(", "):""}. ${m.url||""}`
).join("\n")}`
    };

    try {
      const upstream = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [system, ...messages],
          temperature: 0.4,
          max_tokens: 700,
          stream: false
        })
      });

      const data = await upstream.json();
      const status = upstream.ok ? 200 : 500;
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Relay error", detail: String(e) }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
  }
};


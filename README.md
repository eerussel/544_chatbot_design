This chatbot tries a Cloudflare Worker that calls Mistral’s Chat Completions API.
If the API is unavailable or times out, it automatically falls back to a local majors.json recommender to ensure a reliable demo.

No personal data is stored client-side or server-side; API requests include only the user’s prompt and top-N majors context.
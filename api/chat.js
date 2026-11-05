// Vercel serverless function: keeps your Groq key secret on the server.
// Set GROQ_API_KEY in Vercel -> Project -> Settings -> Environment Variables, then redeploy.
// Optional: set GROQ_MODEL to force one model. Otherwise it tries these in order.
const MODELS = [process.env.GROQ_MODEL, 'openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'].filter(Boolean);

function buildBody(model, messages) {
  const b = { model, temperature: 0.4, messages };
  if (model.startsWith('openai/gpt-oss')) {
    b.reasoning_effort = 'low';       // reasoning models spend tokens thinking, so keep it low
    b.max_completion_tokens = 1500;
  } else {
    b.max_tokens = 500;
  }
  return b;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Använd POST' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'GROQ_API_KEY saknas i Vercel' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
    if (!msgs.length) return res.status(400).json({ error: 'Inga meddelanden' });
    const messages = [{ role: 'system', content: String(body.system || '').slice(0, 8000) }, ...msgs];

    let lastErr = 'Groq-fel';
    for (const model of MODELS) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(buildBody(model, messages))
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = (j.choices?.[0]?.message?.content || '').trim();
        if (text) return res.status(200).json({ text, model });
        lastErr = model + ' gav tomt svar';
        continue;
      }
      lastErr = (model + ': ' + ((j.error && j.error.message) || r.status));
      // model missing / no access -> try the next one; anything else (bad key, rate limit) -> stop
      if (![400, 403, 404].includes(r.status) || !/model|access|permission|not found/i.test(lastErr)) break;
    }
    res.status(502).json({ error: lastErr });
  } catch (e) {
    res.status(500).json({ error: 'Serverfel' });
  }
};

// Vercel serverless function: keeps your Groq key secret on the server.
// Set GROQ_API_KEY in Vercel -> Project -> Settings -> Environment Variables, then redeploy.
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Använd POST' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'GROQ_API_KEY saknas i Vercel' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
    if (!msgs.length) return res.status(400).json({ error: 'Inga meddelanden' });
    const system = String(body.system || '').slice(0, 8000);
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: MODEL, temperature: 0.4, max_tokens: 500,
        messages: [{ role: 'system', content: system }, ...msgs] })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'Groq-fel' });
    res.status(200).json({ text: j.choices?.[0]?.message?.content || '' });
  } catch (e) {
    res.status(500).json({ error: 'Serverfel' });
  }
};

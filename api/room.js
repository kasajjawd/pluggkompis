// Tiny message relay for online 1v1. Stores each room as a Redis list (an ordered event log).
// Needs a free Upstash Redis database connected to the Vercel project (Storage tab).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Använd POST' });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Redis saknas – koppla Upstash Redis i Vercel → Storage och deploya om' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const room = String(b.room || '');
    if (!/^[a-z0-9]{4,10}$/.test(room)) return res.status(400).json({ error: 'Ogiltig rumskod' });
    const key = 'pk:' + room;
    if (b.op === 'push') {
      const ev = String(b.ev || '');
      if (!ev || ev.length > 6000) return res.status(400).json({ error: 'Ogiltigt meddelande' });
      const out = await redis([['RPUSH', key, ev], ['EXPIRE', key, 7200]]);
      if (out[0].result > 500) return res.status(429).json({ error: 'Rummet är fullt – skapa ett nytt' });
      return res.status(200).json({ ok: true, n: out[0].result });
    }
    if (b.op === 'pull') {
      const since = Math.max(0, parseInt(b.since, 10) || 0);
      const out = await redis([['LRANGE', key, since, -1]]);
      return res.status(200).json({ events: out[0].result || [] });
    }
    return res.status(400).json({ error: 'Okänd operation' });
  } catch (e) {
    return res.status(500).json({ error: 'Serverfel: ' + (e && e.message || e) });
  }
};

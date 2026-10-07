// iTunes Search / Lookup の中継（iPhone Safari の CORS ブロック対策）
export default async function handler(req, res) {
  const { type = 'search', ...q } = req.query || {};
  if (!['search', 'lookup'].includes(type)) return res.status(400).json({ error: 'bad type' });
  const allow = ['term', 'media', 'entity', 'limit', 'country', 'lang', 'id'];
  const p = new URLSearchParams();
  for (const k of allow) if (q[k] != null) p.set(k, String(q[k]).slice(0, 300));
  if (type === 'search' && !p.get('term')) return res.status(400).json({ error: 'term required' });
  try {
    const r = await fetch(`https://itunes.apple.com/${type}?${p}`, { headers: { 'User-Agent': 'hearme/7' } });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(r.ok ? 200 : 502).send(r.ok ? body : JSON.stringify({ resultCount: 0, results: [], error: r.status }));
  } catch (e) {
    res.status(502).json({ resultCount: 0, results: [], error: 'upstream' });
  }
}

// ジャケット画像の中継（ストーリー用画像をブラウザで合成するため／Appleの配信元だけ許可）
export default async function handler(req, res) {
  const u = String(req.query?.u || '');
  if (!/^https:\/\/is\d+-ssl\.mzstatic\.com\//.test(u)) return res.status(400).send('bad url');
  try {
    const r = await fetch(u);
    if (!r.ok) return res.status(502).send('upstream');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, s-maxage=604800, immutable');
    res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch { res.status(502).send('error'); }
}

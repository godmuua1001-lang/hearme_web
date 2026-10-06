// 音楽API：iTunes Search（キー不要）・Apple Music ランキング・30秒試聴プレイヤー
const IT = 'https://itunes.apple.com';
const cache = new Map();

function norm(t) {
  return {
    track_id: t.trackId, title: t.trackName, artist: t.artistName,
    artwork: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : null,
    preview_url: t.previewUrl || null, track_url: t.trackViewUrl || null,
    album: t.collectionName || '', ms: t.trackTimeMillis || 0,
  };
}

export async function search(q, { signal, limit = 20 } = {}) {
  q = q.trim(); if (!q) return [];
  const key = q + '|' + limit;
  if (cache.has(key)) return cache.get(key);
  const r = await fetch(`${IT}/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=${limit}&country=JP&lang=ja_jp`, { signal });
  const d = await r.json();
  const seen = new Set();
  const out = (d.results || []).filter(t => t.kind === 'song').map(norm).filter(t => {
    const k = (t.title + '|' + t.artist).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true;
  });
  cache.set(key, out);
  return out;
}

export async function lookup(ids) {
  if (!ids.length) return [];
  const r = await fetch(`${IT}/lookup?id=${ids.join(',')}&country=JP&lang=ja_jp`);
  const d = await r.json();
  return (d.results || []).filter(t => t.kind === 'song').map(norm);
}

// 日本のランキング（Apple Music）。RSSが使えなければ iTunes 検索でフォールバック
export async function chart(limit = 30) {
  const k = 'chart' + limit;
  if (cache.has(k)) return cache.get(k);
  let out = [];
  try {
    const r = await fetch(`https://rss.applemarketingtools.com/api/v2/jp/music/most-played/${limit}/songs.json`);
    const d = await r.json();
    const ids = (d.feed?.results || []).map(x => x.id);
    const full = await lookup(ids);
    const byId = new Map(full.map(t => [String(t.track_id), t]));
    out = ids.map(id => byId.get(String(id))).filter(Boolean);
  } catch { /* CORS等 */ }
  if (!out.length) {
    try {
      const r = await fetch(`${IT}/jp/rss/topsongs/limit=${limit}/json`);
      const d = await r.json();
      const ids = (d.feed?.entry || []).map(e => e.id?.attributes?.['im:id']).filter(Boolean);
      out = await lookup(ids);
    } catch { /* noop */ }
  }
  if (!out.length) out = await search('J-POP ヒット', { limit });
  cache.set(k, out);
  return out;
}

export function links(s) {
  const q = encodeURIComponent(`${s.title} ${s.artist || ''}`.trim());
  return {
    apple: s.track_url || `https://music.apple.com/jp/search?term=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
    youtube: `https://music.youtube.com/search?q=${q}`,
  };
}

// ═════════ 30秒試聴プレイヤー（アプリ全体で1つ） ═════════
const audio = new Audio();
audio.preload = 'none';
let current = null;
const subs = new Set();
const emit = () => subs.forEach(f => f(state()));
function state() {
  return { song: current, playing: !audio.paused && !!current, t: audio.currentTime || 0, d: audio.duration || 30, loading: audio.readyState < 3 && !audio.paused };
}
['play', 'pause', 'timeupdate', 'loadeddata', 'waiting', 'playing'].forEach(e => audio.addEventListener(e, emit));
audio.addEventListener('ended', () => { audio.currentTime = 0; emit(); });

export const player = {
  subscribe(f) { subs.add(f); f(state()); return () => subs.delete(f); },
  state,
  isCurrent(s) { return current && s && (s.preview_url && s.preview_url === current.preview_url); },
  async toggle(s) {
    if (!s?.preview_url) return false;
    if (this.isCurrent(s)) { audio.paused ? audio.play().catch(() => {}) : audio.pause(); return true; }
    current = s; audio.src = s.preview_url; emit();
    try { await audio.play(); } catch { /* ユーザー操作が必要 */ }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist,
        artwork: s.artwork ? [{ src: s.artwork, sizes: '600x600', type: 'image/jpeg' }] : [] });
    }
    return true;
  },
  pause() { audio.pause(); },
  stop() { audio.pause(); current = null; emit(); },
  seek(frac) { if (audio.duration) audio.currentTime = audio.duration * frac; },
};

// ═══════════════════════════════════════════════════════════════
// hearme v7 — きもちを、音楽で届ける
// ═══════════════════════════════════════════════════════════════
import { api, LIVE, errText } from './api.js';
import * as music from './music.js';
import { VAPID_PUBLIC_KEY, GOOGLE_LOGIN } from './config.js';

const VERSION = '7.0.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const buzz = (n = 8) => { try { navigator.vibrate?.(n); } catch { /* */ } };
const safeImg = u => (typeof u === 'string' && (/^https:\/\//.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u))) ? u : null;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const MOODS = [
  ['😊', '嬉しい'], ['😌', '穏やか'], ['🤩', 'アガる'], ['🔥', '熱い'], ['🥰', 'すき'],
  ['😢', '悲しい'], ['🥺', '寂しい'], ['😤', 'モヤモヤ'], ['😴', '眠い'], ['💭', '考え中'],
];
const REACTS = ['❤️', '😢', '👏', '✨', '🫂', '🔥'];
const MOOD_COLOR = { '😊': '#ffb030', '😌': '#3ecfc5', '🤩': '#ffb030', '🔥': '#ff5f7e', '🥰': '#ff8fab', '😢': '#6b95ff', '🥺': '#a78bfa', '😤': '#ff5f7e', '😴': '#8a8d95', '💭': '#3ecfc5' };

// ───────── icons ─────────
const I = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
  note: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  userplus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 20c.7-3.6 3.6-5.5 7-5.5s6.3 1.9 7 5.5M19 8v6M16 11h6"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  share: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
  apple: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.4-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1.1-2.8-4.1zM13.9 4.9c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.4-.6 3.1-1.5z"/></svg>',
  spotify: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#1ed760"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-9-1a.6.6 0 1 1-.3-1.2c3.9-.9 7.2-.5 9.9 1.1.3.2.4.6.3.9zm1.2-2.7a.8.8 0 0 1-1.1.3c-2.7-1.7-6.9-2.2-10.2-1.2a.8.8 0 1 1-.5-1.5c3.7-1.1 8.3-.6 11.4 1.3.4.3.5.8.4 1.1zm.1-2.8C14.7 9 9.4 8.8 6.3 9.7a1 1 0 1 1-.6-1.8c3.5-1.1 9.3-.9 13 1.3a1 1 0 0 1-1 1.7z"/></svg>',
  yt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ff3d3d"><path d="M23 7.2s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.3-1C16.6 3.6 12 3.6 12 3.6s-4.6 0-7.8.3c-.4.1-1.4.1-2.3 1C1.2 5.6 1 7.2 1 7.2S.8 9 .8 10.9v1.8c0 1.8.2 3.7.2 3.7s.2 1.6.9 2.3c.9.9 2 .9 2.6 1 1.8.2 7.5.3 7.5.3s4.6 0 7.8-.3c.4-.1 1.4-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.8.2-3.7v-1.8C23.2 9 23 7.2 23 7.2zM9.7 14.6V8.3l6 3.2-6 3.1z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  camera: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};

// ───────── state ─────────
const S = {
  user: null, profile: null,
  tab: 'home', mode: 'friends',
  friends: [], feed: [], pub: [], mine: [], threads: [], activity: [],
  posts: new Map(), loaded: { feed: false, pub: false, threads: false, mine: false, chart: false },
  moment: null, chart: [], chat: null, seenActivity: 0,
};
const remember = list => { list.forEach(p => S.posts.set(p.id, p)); return list; };

// ───────── time ─────────
const pad = n => String(n).padStart(2, '0');
const hm = d => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const isToday = d => dayKey(d) === dayKey(new Date());
function rel(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  if (s < 604800) return `${Math.floor(s / 86400)}日前`;
  const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()}`;
}
function dayLabel(d) {
  const x = new Date(d), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (dayKey(x) === dayKey(t)) return '今日';
  if (dayKey(x) === dayKey(y)) return '昨日';
  return `${x.getMonth() + 1}月${x.getDate()}日（${'日月火水木金土'[x.getDay()]}）`;
}

// ───────── UI helpers ─────────
let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast div'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function ava(p, size = 40) {
  const src = safeImg(p?.avatar);
  const inner = src ? `<img src="${esc(src)}" alt="" loading="lazy">` : esc(p?.emoji || '🎧');
  return `<div class="ava" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .46)}px">${inner}</div>`;
}
function art(s, size, extra = '') {
  const src = safeImg(s?.artwork);
  const st = size ? `style="width:${size}px;height:${size}px"` : '';
  return `<div class="art" ${st}>${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : I.note}${extra}</div>`;
}
function playBtn(s, cls = '') {
  if (!s?.preview_url) return '';
  const on = music.player.isCurrent(s) && music.player.state().playing;
  return `<button class="play ${cls}" data-act="play" data-src="${esc(s.preview_url)}" aria-label="試聴">${on ? I.pause : I.play}</button>`;
}
const songData = s => esc(JSON.stringify({ title: s.title, artist: s.artist, artwork: s.artwork, preview_url: s.preview_url, track_url: s.track_url, track_id: s.track_id }));
const postedToday = () => S.mine.filter(p => isToday(p.created_at));
const leftToday = () => Math.max(0, 3 - postedToday().length);
const inviteURL = () => `${location.origin}/?inv=${S.profile?.code || ''}`;

// ═══════════════════════ SHEET ═══════════════════════
let sheetClose = null;
function openSheet(html, { full = false, onClose } = {}) {
  const sh = $('#sheet'); $('#sheet-body').innerHTML = html;
  sh.classList.toggle('full', full); sh.style.transform = '';
  sh.classList.add('on'); $('#sheet-bg').classList.add('on');
  $('#sheet-body').scrollTop = 0;
  sheetClose = onClose || null;
}
function closeSheet() {
  $('#sheet').classList.remove('on'); $('#sheet-bg').classList.remove('on');
  const f = sheetClose; sheetClose = null; f?.();
}
function confirmSheet({ title, text = '', ok = 'OK', danger = false }) {
  return new Promise(res => {
    openSheet(`<div style="padding:8px 22px 22px;text-align:center">
      <div class="disp" style="font-size:20px;margin-bottom:8px">${esc(title)}</div>
      <div class="muted" style="font-size:13.5px;line-height:1.7;margin-bottom:20px">${esc(text)}</div>
      <button class="btn ${danger ? 'd' : 'p'} w" id="cf-ok">${esc(ok)}</button>
      <button class="btn g w" style="margin-top:8px" id="cf-no">キャンセル</button></div>`, { onClose: () => res(false) });
    $('#cf-ok').onclick = () => { sheetClose = null; closeSheet(); res(true); };
    $('#cf-no').onclick = () => closeSheet();
  });
}
// drag-to-close
(() => {
  let y0 = null, dy = 0; const sh = $('#sheet');
  sh.addEventListener('touchstart', e => {
    const body = $('#sheet-body');
    if (e.target.closest('.grab') || body.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }
  }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (y0 == null) return; dy = e.touches[0].clientY - y0;
    if (dy > 0 && ($('#sheet-body').scrollTop <= 0 || e.target.closest('.grab'))) sh.style.transform = `translateY(${dy}px)`;
    else if (dy < 0) { y0 = null; sh.style.transform = ''; sh.style.transition = ''; }
  }, { passive: true });
  sh.addEventListener('touchend', () => {
    if (y0 == null) return; sh.style.transition = '';
    if (dy > 110) closeSheet(); else sh.style.transform = '';
    y0 = null;
  });
})();

// ═══════════════════════ PAGES (スワイプで戻る) ═══════════════════════
const pageStack = [];
function openPage(id) {
  const pg = $('#' + id); pg.classList.add('on'); pg.style.transform = '';
  if (!pageStack.includes(id)) pageStack.push(id);
  history.pushState({ page: id }, '');
}
function closePage(id = pageStack[pageStack.length - 1], fromPop = false) {
  if (!id) return;
  const pg = $('#' + id); pg.classList.remove('on'); pg.style.transform = '';
  pageStack.splice(pageStack.indexOf(id), 1);
  if (id === 'pg-chat') leaveChat();
  if (!fromPop) history.back();
}
addEventListener('popstate', () => {
  if ($('#sheet').classList.contains('on')) { closeSheet(); return; }
  if (pageStack.length) closePage(undefined, true);
});
(() => {
  let x0 = null, dx = 0, pg = null;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0]; pg = e.target.closest('.page.on');
    if (pg && t.clientX < 28) { x0 = t.clientX; dx = 0; pg.style.transition = 'none'; } else x0 = null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (x0 == null) return; dx = Math.max(0, e.touches[0].clientX - x0);
    pg.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (x0 == null) return; pg.style.transition = '';
    if (dx > 90) closePage(pg.id); else pg.style.transform = '';
    x0 = null;
  });
})();

// ═══════════════════════ TABS ═══════════════════════
function setTab(t) {
  if (S.tab === t) { $('#t-' + t).scrollTo({ top: 0, behavior: 'smooth' }); return; }
  S.tab = t; buzz(5);
  $$('.tab').forEach(x => x.classList.toggle('on', x.id === 't-' + t));
  $$('.nb').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  if (t === 'explore' && !S.loaded.chart) loadChart();
  if (t === 'dm') refreshThreads();
  if (t === 'me') { refreshMe(); S.seenActivity = S.activity.length; badges(); }
  render();
}

function render() {
  if (S.tab === 'home') renderHome();
  else if (S.tab === 'explore') renderExplore();
  else if (S.tab === 'dm') renderDM();
  else if (S.tab === 'me') renderMe();
}

function badges() {
  const un = S.threads.reduce((a, t) => a + (+t.unread || 0), 0);
  const b = $('#dm-badge'); b.textContent = un > 9 ? '9+' : un; b.classList.toggle('hide', !un);
  const na = Math.max(0, S.activity.length - S.seenActivity);
  const m = $('#me-badge'); m.textContent = na > 9 ? '9+' : na; m.classList.toggle('hide', !na || S.tab === 'me');
  if ('setAppBadge' in navigator) { (un ? navigator.setAppBadge(un) : navigator.clearAppBadge()).catch?.(() => {}); }
}

// ═══════════════════════ HOME ═══════════════════════
function momentActive() {
  if (!S.moment?.at) return 0;
  const left = new Date(S.moment.at).getTime() + 600000 - Date.now();
  return left > 0 ? left : 0;
}
const fmtLeft = ms => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}`;

function postCard(p) {
  const locked = !p.mine && !postedToday().length;
  const a = p.author || {};
  const rx = REACTS.map(e => {
    const n = p.reactions?.[e] || 0; const on = p.my_reaction === e;
    return `<button class="rx ${on ? 'on' : ''}" data-act="react" data-id="${p.id}" data-e="${e}">${e}${n ? `<b>${n}</b>` : ''}</button>`;
  }).join('');
  const [me, ml] = splitMood(p.mood);
  return `<article class="post ${locked ? 'locked' : ''}" data-post="${p.id}">
    <div class="post-hd">${ava(a, 38)}<div class="who"><div class="nm ellip">${esc(p.mine ? 'あなた' : a.name)}</div>
      <div class="tm">${rel(p.created_at)}${p.on_time ? '<span class="ontime">⚡ オンタイム</span>' : ''}${p.is_public && p.mine ? '<span>· 🌍 みんなにも</span>' : ''}</div></div>
      <button class="icon-btn" style="width:32px;height:32px;background:none;border:none" data-act="post-menu" data-id="${p.id}" aria-label="メニュー">${I.more}</button></div>
    <div class="song tap" data-act="open-post" data-id="${p.id}">${art(p)}<div class="meta"><div class="ti ellip">${esc(p.title)}</div><div class="ar ellip">${esc(p.artist)}</div></div>${playBtn(p)}</div>
    ${p.comment ? `<div class="cm">${esc(p.comment)}</div>` : ''}
    <div class="mood"><span class="chip">${esc(me)} ${esc(ml)}</span></div>
    ${locked ? '' : `<div class="reacts">${rx}</div>`}
    ${locked ? `<div class="lockmsg"><div style="font-size:26px">🔒</div><b>今日の1曲をシェアすると見られます</b><button class="btn p sm" data-act="compose">シェアする</button></div>` : ''}
  </article>`;
}
function splitMood(m = '') { const i = m.indexOf(' '); return i > 0 ? [m.slice(0, i), m.slice(i + 1)] : [m, '']; }

function skeletonPosts(n = 2) {
  return Array.from({ length: n }, () => `<div class="post"><div class="row" style="margin-bottom:12px"><div class="sk" style="width:38px;height:38px;border-radius:50%"></div><div style="flex:1"><div class="sk" style="width:40%;height:12px;margin-bottom:6px"></div><div class="sk" style="width:25%;height:10px"></div></div></div><div class="sk" style="height:80px;border-radius:16px"></div></div>`).join('');
}

function renderHome() {
  const el = $('#t-home');
  const ml = momentActive();
  const posted = postedToday().length;
  const list = S.mode === 'friends' ? S.feed : S.pub;
  const loaded = S.mode === 'friends' ? S.loaded.feed : S.loaded.pub;
  const todayFriends = new Set(S.feed.filter(p => !p.mine && isToday(p.created_at)).map(p => p.author?.id));
  let feedHTML;
  if (!loaded) feedHTML = skeletonPosts(3);
  else if (S.mode === 'friends' && !S.friends.length) feedHTML = `<div class="card" style="margin:6px 16px 14px;"><div class="empty"><span class="e-ic">🎧</span><b>フレンドを招待しよう</b>招待リンクを送ると、お互いの「今日の1曲」が届くようになります<div style="display:flex;gap:8px;justify-content:center;margin-top:16px"><button class="btn p sm" data-act="share-invite">${I.share} 招待リンクを送る</button><button class="btn g sm" data-act="add-friend">コードで追加</button></div></div></div>` + list.filter(p => p.mine).map(postCard).join('');
  else if (!list.length) feedHTML = S.mode === 'friends'
    ? `<div class="empty"><span class="e-ic">🌙</span><b>まだ静かです</b>フレンドの投稿はここに届きます。<br>先に今日の1曲をシェアしてみよう</div>`
    : `<div class="empty"><span class="e-ic">🌍</span><b>まだ誰も投稿していません</b>「みんなにも届ける」をオンにして投稿すると、ここに匿名で並びます</div>`;
  else feedHTML = list.map(postCard).join('') + (S.mode === 'public' ? `<div class="faint" style="text-align:center;font-size:12px;padding:10px 0 20px">知らない人の名前は表示されません。リアクションだけで気持ちを返そう</div>` : '');

  el.innerHTML = `
    <div class="hd"><div class="logo"><img src="/logo-mark.png" alt=""><span>hearme</span></div>
      <button class="icon-btn" data-act="add-friend" aria-label="フレンド追加">${I.userplus}</button></div>
    <div class="ptr" id="ptr">↓ 引っ張って更新</div>
    ${LIVE ? '' : `<div class="demo">🧪 デモモード：データはこの端末だけに保存されます。フレンド（ゆーき・みお）はお試し用です</div>`}
    ${ml ? `<div class="moment tap" data-act="compose"><div style="flex:1"><div style="font-weight:700;font-size:15px">⚡ hearmeの時間！</div><div class="muted" style="font-size:12px;margin-top:2px">みんな今、曲を選んでいます</div></div><div class="t" data-countdown>${fmtLeft(ml)}</div></div>` : ''}
    <div class="stories">
      <div class="story" data-act="${posted ? 'my-latest' : 'compose'}"><div class="ring ${posted ? 'new' : ''}">${ava(S.profile, 54)}</div><small class="ellip">${posted ? 'あなた' : '＋ シェア'}</small></div>
      ${S.friends.map(f => `<div class="story" data-act="friend-latest" data-id="${f.id}"><div class="ring ${todayFriends.has(f.id) ? 'new' : ''}">${ava(f, 54)}</div><small class="ellip">${esc(f.name)}</small></div>`).join('')}
      <div class="story add" data-act="add-friend"><div class="ring">${`<div class="ava" style="width:54px;height:54px">${I.plus.replace('<svg', '<svg width="20" height="20"')}</div>`}</div><small>招待</small></div>
    </div>
    ${posted ? '' : `<div class="cta tap" data-act="compose"><div class="ic">${I.note}</div><div style="flex:1"><div style="font-weight:600;font-size:15px">今日の1曲をシェア</div><div class="muted" style="font-size:12px;margin-top:2px">シェアするとフレンドの曲が見られます</div></div><div class="faint">›</div></div>`}
    <div style="padding:0 16px 12px"><div class="seg"><button class="${S.mode === 'friends' ? 'on' : ''}" data-act="mode" data-m="friends">フレンド</button><button class="${S.mode === 'public' ? 'on' : ''}" data-act="mode" data-m="public">みんな</button></div></div>
    ${feedHTML}
    <div style="height:90px"></div>`;
}

// pull to refresh
(() => {
  const el = $('#t-home'); let y0 = null, dy = 0;
  el.addEventListener('touchstart', e => { if (el.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 == null) return; dy = e.touches[0].clientY - y0;
    const p = $('#ptr'); if (!p) return;
    if (dy > 0) { p.style.height = Math.min(60, dy * .45) + 'px'; p.textContent = dy > 120 ? '↻ 離して更新' : '↓ 引っ張って更新'; }
  }, { passive: true });
  el.addEventListener('touchend', async () => {
    if (y0 == null) return; y0 = null; const p = $('#ptr');
    if (dy > 120) { if (p) p.textContent = '更新中…'; buzz(12); await loadFeeds(); }
    if (p) p.style.height = '0';
  });
})();

// ═══════════════════════ COMPOSER ═══════════════════════
const C = { song: null, mood: null, comment: '', pub: false, results: [], q: '', ctrl: null };
function openComposer(prefill) {
  if (!leftToday()) { toast('今日はもう3回シェアしました。また明日！'); return; }
  Object.assign(C, { song: prefill || null, mood: null, comment: '', pub: false, results: [], q: '' });
  openSheet(`<div id="cmp"></div>`, { full: true });
  renderComposer();
  if (!prefill) setTimeout(() => $('#cmp-q')?.focus(), 400);
}
function renderComposer() {
  const ml = momentActive();
  const ok = C.song && C.mood;
  $('#cmp').innerHTML = `
    <div class="row" style="padding:0 18px 10px"><button class="faint" style="font-size:14px" data-act="close-sheet">キャンセル</button>
      <div class="disp" style="flex:1;text-align:center;font-size:17px">今日の1曲</div>
      <button class="btn p sm" id="cmp-go" ${ok ? '' : 'disabled'} data-act="post">シェア</button></div>
    ${ml ? `<div class="moment" style="margin:0 18px 12px;padding:10px 14px"><div style="flex:1;font-size:13px;font-weight:700">⚡ hearmeの時間！ 今シェアすると「オンタイム」</div><div class="t" style="font-size:18px" data-countdown>${fmtLeft(ml)}</div></div>` : ''}
    ${C.song ? `<div class="picked">${art(C.song, 56)}<div style="flex:1;min-width:0"><div class="ellip" style="font-weight:600">${esc(C.song.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(C.song.artist)}</div></div>${playBtn(C.song)}<button class="icon-btn" style="width:32px;height:32px" data-act="unpick" aria-label="選び直す">${I.x.replace('<svg', '<svg width="14" height="14"')}</button></div>`
      : `<div class="srch">${I.search}<input id="cmp-q" placeholder="曲名・アーティスト名で検索" value="${esc(C.q)}" enterkeyhint="search" autocomplete="off"><span id="cmp-spin"></span></div>
         <div id="cmp-res" style="padding-top:6px">${C.results.map((s, i) => `<div class="res" data-act="pick" data-i="${i}">${art(s)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(s.artist)}</div></div>${playBtn(s, 'dim')}</div>`).join('') ||
           (C.q ? '' : `<div class="faint" style="padding:18px;font-size:13px;text-align:center">いま頭の中で流れている曲は？</div>`)}</div>`}
    ${C.song ? `
    <div class="sec" style="padding-top:20px"><span class="lbl">今の気分</span></div>
    <div class="moods">${MOODS.map(([e, l]) => `<button class="md ${C.mood === e + ' ' + l ? 'on' : ''}" data-act="mood" data-m="${e} ${l}"><span>${e}</span><small>${l}</small></button>`).join('')}</div>
    <div class="sec" style="padding-top:20px"><span class="lbl">ひとこと（なくてもOK）</span><span class="faint" style="font-size:11px" id="cmp-n">${C.comment.length}/60</span></div>
    <div style="padding:0 18px"><textarea class="inp" id="cmp-c" rows="2" maxlength="60" placeholder="この曲を選んだ理由とか">${esc(C.comment)}</textarea></div>
    <div class="toggle" data-act="pubtoggle"><div style="flex:1"><div style="font-size:14px;font-weight:600">🌍 みんなにも匿名で届ける</div><div class="faint" style="font-size:12px;margin-top:2px">名前は出ません。知らない誰かが絵文字で反応してくれるかも</div></div><div class="sw ${C.pub ? 'on' : ''}"></div></div>
    <div class="faint" style="text-align:center;font-size:12px;padding:6px 0 30px">今日はあと${leftToday()}回シェアできます</div>` : ''}`;
  const q = $('#cmp-q');
  if (q) q.oninput = () => { C.q = q.value; searchDebounced(); };
  const c = $('#cmp-c');
  if (c) c.oninput = () => { C.comment = c.value; $('#cmp-n').textContent = `${c.value.length}/60`; };
}
let sT;
function searchDebounced() {
  clearTimeout(sT);
  sT = setTimeout(async () => {
    const q = C.q.trim(); if (!q) { C.results = []; refreshResults(); return; }
    C.ctrl?.abort(); C.ctrl = new AbortController();
    $('#cmp-spin') && ($('#cmp-spin').className = 'spin');
    try { C.results = await music.search(q, { signal: C.ctrl.signal }); refreshResults(); if (!C.results.length) $('#cmp-res').innerHTML = `<div class="faint" style="padding:18px;font-size:13px;text-align:center">「${esc(q)}」は見つかりませんでした</div>`; }
    catch (e) { if (e.name !== 'AbortError') toast('検索できませんでした'); }
    $('#cmp-spin') && ($('#cmp-spin').className = '');
  }, 320);
}
function refreshResults() {
  const r = $('#cmp-res'); if (!r) return;
  r.innerHTML = C.results.map((s, i) => `<div class="res" data-act="pick" data-i="${i}">${art(s)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(s.artist)}</div></div>${playBtn(s, 'dim')}</div>`).join('');
}
async function submitPost() {
  if (!C.song || !C.mood) return;
  const b = $('#cmp-go'); b.disabled = true; b.textContent = '送信中…';
  try {
    await api.createPost({
      track_id: C.song.track_id || null, title: C.song.title.slice(0, 200), artist: (C.song.artist || '').slice(0, 200),
      artwork: safeImg(C.song.artwork) && C.song.artwork.startsWith('https://') ? C.song.artwork : null,
      preview_url: C.song.preview_url?.startsWith('https://') ? C.song.preview_url : null,
      track_url: C.song.track_url?.startsWith('https://') ? C.song.track_url : null,
      mood: C.mood, comment: C.comment.trim().slice(0, 60), is_public: C.pub,
    });
    buzz([10, 40, 10]); closeSheet(); toast(momentActive() ? '⚡ オンタイムでシェアしました！' : '🎵 シェアしました');
    hideMoment(); setTab('home'); await loadFeeds();
  } catch (e) { toast(errText(e)); b.disabled = false; b.textContent = 'シェア'; }
}

// ═══════════════════════ SONG DETAIL ═══════════════════════
function openPost(id) {
  const p = S.posts.get(id); if (!p) return;
  if (!p.mine && !postedToday().length) { openComposer(); toast('先に今日の1曲をシェアしよう'); return; }
  const a = p.author || {}, L = music.links(p);
  const canDM = !p.mine && a.id && S.friends.some(f => f.id === a.id);
  const [me, ml] = splitMood(p.mood);
  openSheet(`
    <div class="sd-art">${safeImg(p.artwork) ? `<img src="${esc(p.artwork)}" alt="">` : I.note.replace('width="22" height="22"', 'width="60" height="60"')}${playBtn(p, 'bigplay')}</div>
    ${p.preview_url ? `<div class="prog" data-prog="${esc(p.preview_url)}"><i></i></div>` : ''}
    <div style="padding:0 20px 14px"><div class="disp" style="font-size:24px;line-height:1.2">${esc(p.title)}</div><div class="muted" style="margin-top:4px">${esc(p.artist)}</div></div>
    <div class="sd-links"><a href="${esc(L.apple)}" target="_blank" rel="noopener">${I.apple} Apple</a><a href="${esc(L.spotify)}" target="_blank" rel="noopener">${I.spotify} Spotify</a><a href="${esc(L.youtube)}" target="_blank" rel="noopener">${I.yt} YouTube</a></div>
    <div class="card" style="margin:0 20px 14px;padding:14px">
      <div class="row">${ava(a, 36)}<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px">${esc(p.mine ? 'あなた' : a.name)}</div><div class="faint" style="font-size:11.5px">${rel(p.created_at)} · ${esc(me)} ${esc(ml)}${p.on_time ? ' · <span class="ontime">⚡ オンタイム</span>' : ''}</div></div></div>
      ${p.comment ? `<div style="margin-top:10px;font-size:14.5px;line-height:1.65">「${esc(p.comment)}」</div>` : ''}
      <div class="reacts">${REACTS.map(e => `<button class="rx ${p.my_reaction === e ? 'on' : ''}" data-act="react" data-id="${p.id}" data-e="${e}">${e}${p.reactions?.[e] ? `<b>${p.reactions[e]}</b>` : ''}</button>`).join('')}</div>
    </div>
    ${canDM ? `<div style="padding:0 20px 12px"><div class="composer" style="border:none;padding:0;background:none"><textarea id="reply" rows="1" placeholder="${esc(a.name)}に返信…" maxlength="1000"></textarea><button class="send" data-act="reply" data-id="${p.id}" aria-label="送信">${I.send}</button></div><div class="faint" style="font-size:11.5px;margin-top:6px;padding-left:4px">この曲をつけてDMで送ります</div></div>` : ''}
    <div style="padding:4px 20px 24px;display:flex;gap:8px">${p.mine ? `<button class="btn d sm" data-act="del-post" data-id="${p.id}">投稿を削除</button>` : `<button class="btn g sm" data-act="share-song" data-id="${p.id}">この曲で投稿</button><button class="btn g sm" data-act="post-menu" data-id="${p.id}">…</button>`}</div>`);
  updateProgress();
}

// ═══════════════════════ EXPLORE ═══════════════════════
const X = { q: '', results: [], ctrl: null, searching: false };
async function loadChart() {
  try { S.chart = await music.chart(30); } catch { S.chart = []; }
  S.loaded.chart = true; if (S.tab === 'explore') renderExplore();
}
function songRow(s, i, rank) {
  return `<div class="rank">${rank ? `<div class="n">${rank}</div>` : ''}${art(s)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:600">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(s.artist)}</div></div>${playBtn(s, 'dim')}<button class="btn g sm" data-act="share-this" data-song="${songData(s)}">シェア</button></div>`;
}
function renderExplore() {
  const el = $('#t-explore');
  const top = S.chart.slice(0, 10), rest = S.chart.slice(10);
  const searchArea = X.q ? (X.searching ? `<div style="padding:16px 18px">${'<div class="sk" style="height:52px;margin-bottom:10px"></div>'.repeat(4)}</div>` :
    (X.results.length ? X.results.map((s, i) => songRow(s, i)).join('') : `<div class="empty"><span class="e-ic">🔎</span>見つかりませんでした</div>`)) : '';
  el.innerHTML = `
    <div class="hd"><h1>探す</h1></div>
    <div class="srch" style="margin-bottom:6px">${I.search}<input id="ex-q" placeholder="曲・アーティストを探す" value="${esc(X.q)}" enterkeyhint="search" autocomplete="off">${X.q ? `<button data-act="ex-clear" class="faint" style="width:24px;height:24px">${I.x.replace('<svg', '<svg width="14" height="14"')}</button>` : ''}</div>
    ${X.q ? `<div style="padding-top:8px">${searchArea}</div>` : `
    <div class="sec" style="padding-top:20px"><span class="disp" style="font-size:18px">🇯🇵 いま日本で聴かれている曲</span></div>
    ${S.loaded.chart ? `<div class="hero-chart">${top.map((s, i) => `<div class="hc"><div class="art" style="width:150px;height:150px">${safeImg(s.artwork) ? `<img src="${esc(s.artwork)}" alt="" loading="lazy">` : I.note}${playBtn(s)}<div style="position:absolute;left:10px;top:8px;font-family:var(--disp);font-weight:800;font-size:22px;text-shadow:0 2px 10px rgba(0,0,0,.6)">${i + 1}</div></div><div class="ti ellip">${esc(s.title)}</div><div class="ar ellip">${esc(s.artist)}</div><button class="btn g sm" style="margin-top:8px;width:100%" data-act="share-this" data-song="${songData(s)}">この曲でシェア</button></div>`).join('')}</div>
      <div style="padding-top:10px">${rest.map((s, i) => songRow(s, i, i + 11)).join('')}</div>`
      : `<div class="hero-chart">${'<div class="hc"><div class="sk" style="width:150px;height:150px;border-radius:18px"></div></div>'.repeat(3)}</div>`}
    <div class="faint" style="font-size:11px;text-align:center;padding:16px">ランキング・試聴：Apple Music / iTunes</div>`}
    <div style="height:90px"></div>`;
  const q = $('#ex-q');
  q.oninput = () => {
    X.q = q.value; clearTimeout(X.t);
    if (!X.q.trim()) { X.results = []; renderExplore(); $('#ex-q').focus(); return; }
    X.t = setTimeout(async () => {
      X.ctrl?.abort(); X.ctrl = new AbortController(); X.searching = true; renderExploreKeep();
      try { X.results = await music.search(X.q, { signal: X.ctrl.signal }); } catch (e) { if (e.name === 'AbortError') return; X.results = []; }
      X.searching = false; renderExploreKeep();
    }, 320);
  };
}
function renderExploreKeep() {
  const pos = $('#ex-q')?.selectionStart; renderExplore();
  const q = $('#ex-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch { /* */ } }
}

// ═══════════════════════ DM LIST ═══════════════════════
function renderDM() {
  const el = $('#t-dm');
  let body;
  if (!S.loaded.threads) body = Array.from({ length: 4 }, () => `<div class="th"><div class="sk" style="width:50px;height:50px;border-radius:50%"></div><div style="flex:1"><div class="sk" style="width:35%;height:13px;margin-bottom:7px"></div><div class="sk" style="width:60%;height:11px"></div></div></div>`).join('');
  else if (!S.threads.length) body = `<div class="empty"><span class="e-ic">💬</span><b>DMはフレンドとだけ</b>招待コードを交換した相手とだけメッセージできます。知らない人からは届きません。<div style="margin-top:16px"><button class="btn p sm" data-act="share-invite">${I.share} 招待リンクを送る</button></div></div>`;
  else body = S.threads.map(t => {
    const l = t.last; const un = +t.unread || 0;
    const pv = !l ? 'メッセージを送ってみよう' : (l.mine ? 'あなた: ' : '') + (l.song && !l.body ? '🎵 曲を送りました' : (l.song ? '🎵 ' : '') + l.body);
    return `<div class="th" data-act="chat" data-id="${esc(t.peer.id)}">${ava(t.peer, 52)}<div class="info"><div class="nm ellip">${esc(t.peer.name)}</div><div class="pv ellip ${un ? 'un' : ''}">${esc(pv)}</div></div><div class="rt">${l ? `<div class="tm">${rel(l.created_at)}</div>` : ''}${un ? `<div class="cnt">${un}</div>` : ''}</div></div>`;
  }).join('');
  el.innerHTML = `<div class="hd"><h1>メッセージ</h1><button class="icon-btn" data-act="add-friend" aria-label="フレンド追加">${I.userplus}</button></div>${body}<div style="height:90px"></div>`;
}

// ═══════════════════════ CHAT ═══════════════════════
async function openChat(peerId) {
  let peer = S.friends.find(f => f.id === peerId) || S.threads.find(t => t.peer.id === peerId)?.peer;
  if (!peer) { await loadFriends(); peer = S.friends.find(f => f.id === peerId); }
  if (!peer) { toast('フレンドではない相手とはDMできません'); return; }
  S.chat = { peer, msgs: [], typingUntil: 0, typing: null, loadingOld: false, done: false };
  const pg = $('#pg-chat');
  pg.innerHTML = `<div class="page-hd"><button class="back" data-act="close-page">${I.back}</button>${ava(peer, 36)}<div class="ttl"><div style="font-weight:600;font-size:15px" class="ellip">${esc(peer.name)}</div><div class="faint" style="font-size:11px" id="chat-sub">フレンド</div></div><button class="icon-btn" style="background:none;border:none" data-act="friend-menu" data-id="${esc(peer.id)}">${I.more}</button></div>
    <div class="chat" id="chat"><div style="margin:auto;padding:30px" class="faint"><div class="spin" style="margin:0 auto"></div></div></div>
    <div class="composer"><button class="icon-btn" data-act="chat-song" aria-label="曲を送る">${I.note.replace('width="22" height="22"', 'width="19" height="19"')}</button><textarea id="chat-in" rows="1" placeholder="メッセージ" maxlength="1000" enterkeyhint="send"></textarea><button class="send" data-act="chat-send" id="chat-send" disabled aria-label="送信">${I.send}</button></div>`;
  openPage('pg-chat'); document.body.classList.add('chat-open');
  const inp = $('#chat-in');
  let lastPing = 0;
  inp.oninput = () => {
    inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
    $('#chat-send').disabled = !inp.value.trim();
    if (Date.now() - lastPing > 2500 && inp.value) { lastPing = Date.now(); S.chat?.typing?.ping(); }
  };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isIOS) { e.preventDefault(); chatSend(); } };
  S.chat.typing = api.joinTyping(peer.id, () => { if (!S.chat) return; S.chat.typingUntil = Date.now() + 4000; drawTyping(); setTimeout(drawTyping, 4100); });
  $('#chat').onscroll = () => { if ($('#chat').scrollTop < 60) loadOlder(); };
  try {
    S.chat.msgs = await api.messages(peer.id);
    S.chat.done = S.chat.msgs.length < 50;
    drawChat(true);
    await api.markRead(peer.id);
    const t = S.threads.find(t => t.peer.id === peer.id); if (t) t.unread = 0; badges();
  } catch (e) { $('#chat').innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
}
function leaveChat() { S.chat?.typing?.leave(); S.chat = null; document.body.classList.remove('chat-open'); refreshThreads(); }
async function loadOlder() {
  const c = S.chat; if (!c || c.loadingOld || c.done || !c.msgs.length || !api.live) return;
  c.loadingOld = true; const box = $('#chat'); const h0 = box.scrollHeight;
  try {
    const older = await api.messages(c.peer.id, c.msgs[0].id);
    c.done = older.length < 50; c.msgs = older.concat(c.msgs); drawChat();
    box.scrollTop = box.scrollHeight - h0;
  } catch { /* */ }
  c.loadingOld = false;
}
function msgHTML(m, me) {
  const mine = m.sender === me;
  const s = m.song;
  if (s?.reaction) return `<div class="rxmsg">${mine ? 'あなた' : esc(S.chat.peer.name)}が${mine ? '' : 'あなたの'}「${esc(s.title)}」に ${esc(s.reaction)}</div>`;
  const card = s ? `<div class="mcard">${art(s, 0, playBtn(s))}<div class="mi"><div class="ti ellip">${esc(s.title)}</div><div class="ar ellip">${esc(s.artist)}</div>${s.reply_to ? '<div class="faint" style="font-size:11px;margin-top:3px">↩︎ 投稿への返信</div>' : ''}</div>${m.body ? `<div class="bub">${esc(m.body)}</div>` : ''}</div>` : '';
  return `<div class="msg ${mine ? 'me' : 'them'} ${m._pending ? 'pending' : ''} ${m._failed ? 'failed' : ''}" data-mid="${m.id}">${card || `<div class="bub">${esc(m.body)}</div>`}<div class="st">${m._failed ? '送信失敗・タップで再送' : hm(m.created_at)}</div></div>`;
}
function drawChat(toBottom) {
  const c = S.chat; if (!c) return; const box = $('#chat'); const me = api.uid;
  const near = toBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (!c.msgs.length) { box.innerHTML = `<div class="empty" style="margin:auto"><span class="e-ic">👋</span><b>${esc(c.peer.name)}とのDM</b>メッセージや曲を送ってみよう</div>`; return; }
  let html = '', lastDay = '';
  const lastRead = [...c.msgs].reverse().find(m => m.sender === me && m.read_at);
  c.msgs.forEach(m => {
    const d = dayKey(m.created_at); if (d !== lastDay) { html += `<div class="day">${dayLabel(m.created_at)}</div>`; lastDay = d; }
    html += msgHTML(m, me);
    if (lastRead && m.id === lastRead.id) html = html.replace(/<div class="st">([^<]*)<\/div><\/div>$/, `<div class="st">既読 · $1</div></div>`);
  });
  html += `<div id="typing-slot"></div>`;
  box.innerHTML = html; drawTyping();
  if (near) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}
function drawTyping() {
  const c = S.chat; if (!c) return; const on = Date.now() < c.typingUntil;
  const slot = $('#typing-slot'); if (slot) slot.innerHTML = on ? '<div class="typing"><i></i><i></i><i></i></div>' : '';
  const sub = $('#chat-sub'); if (sub) sub.textContent = on ? '入力中…' : 'フレンド';
  if (on) { const b = $('#chat'); if (b.scrollHeight - b.scrollTop - b.clientHeight < 160) b.scrollTop = b.scrollHeight; }
}
async function chatSend(song) {
  const c = S.chat; if (!c) return;
  const inp = $('#chat-in'); const body = song ? '' : inp.value.trim();
  if (!body && !song) return;
  if (!song) { inp.value = ''; inp.style.height = 'auto'; $('#chat-send').disabled = true; }
  const tmp = { id: 'tmp' + Date.now(), sender: api.uid, receiver: c.peer.id, body, song: song || null, created_at: new Date().toISOString(), _pending: true };
  c.msgs.push(tmp); drawChat(true); buzz(6);
  try {
    const m = await api.send(c.peer.id, body, song);
    const i = c.msgs.indexOf(tmp); if (i >= 0) c.msgs[i] = m;
  } catch (e) { tmp._pending = false; tmp._failed = true; toast(errText(e)); }
  drawChat(true);
}
function openSongPicker(onPick) {
  const P = { q: '', res: [] };
  openSheet(`<div style="padding:0 0 10px"><div class="disp" style="text-align:center;font-size:17px;margin-bottom:12px">曲を送る</div><div class="srch">${I.search}<input id="sp-q" placeholder="曲名・アーティスト名" enterkeyhint="search" autocomplete="off"></div><div id="sp-res" style="padding-top:6px;min-height:40vh"></div></div>`, { full: true });
  const q = $('#sp-q'); setTimeout(() => q.focus(), 350);
  let t, ctrl;
  q.oninput = () => {
    clearTimeout(t); t = setTimeout(async () => {
      ctrl?.abort(); ctrl = new AbortController();
      try { P.res = await music.search(q.value, { signal: ctrl.signal }); } catch { return; }
      $('#sp-res').innerHTML = P.res.map((s, i) => `<div class="res" data-i="${i}">${art(s)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px">${esc(s.artist)}</div></div>${playBtn(s, 'dim')}<button class="btn p sm" data-sp="${i}">送る</button></div>`).join('');
    }, 300);
  };
  $('#sp-res').onclick = e => { const b = e.target.closest('[data-sp]'); if (!b) return; e.stopPropagation(); const s = P.res[+b.dataset.sp]; closeSheet(); onPick(s); };
}

// ═══════════════════════ ME ═══════════════════════
function streak() {
  const days = new Set(S.mine.map(p => dayKey(p.created_at)));
  let n = 0; const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function renderMe() {
  const el = $('#t-me'); const p = S.profile || {};
  const cal = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ps = S.mine.filter(x => dayKey(x.created_at) === dayKey(d));
    const e = ps.length ? splitMood(ps[ps.length - 1].mood)[0] : '';
    cal.push(`<div class="${i === 0 ? 'today' : ''}" style="${e ? `background:${MOOD_COLOR[e] || '#e9e4d8'}22` : ''}">${esc(e)}<small>${d.getDate()}</small></div>`);
  }
  el.innerHTML = `
    <div class="hd"><h1>じぶん</h1><button class="icon-btn" data-act="settings" aria-label="設定">${I.gear}</button></div>
    <div class="ph">${ava(p, 92)}<div class="nm">${esc(p.name)}</div>${p.bio ? `<div class="bio">${esc(p.bio)}</div>` : ''}
      <button class="code" data-act="copy-code">${esc(p.code || '------')} <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg></button></div>
    <div style="display:flex;gap:8px;padding:0 16px 14px"><button class="btn p" style="flex:1;height:44px;font-size:14px" data-act="share-invite">${I.share} 招待リンクを送る</button><button class="btn g" style="flex:1;height:44px;font-size:14px" data-act="add-friend">コードで追加</button></div>
    <div class="card stats"><div><b>${S.mine.length}</b><small>シェア</small></div><div><b>${S.friends.length}</b><small>フレンド</small></div><div><b>${streak()}</b><small>連続日数🔥</small></div></div>
    <div class="card box"><h3>きもちログ（2週間）</h3><div class="cal">${cal.join('')}</div></div>
    ${S.activity.length ? `<div class="card box"><h3>届いたリアクション</h3>${S.activity.slice(0, 8).map(a => `<div class="li">${ava(a.who, 34)}<div style="flex:1;min-width:0;font-size:13px"><b>${esc(a.who?.name)}</b> が <span class="ellip">「${esc(a.post?.title)}」</span>に ${esc(a.emoji)}</div><div class="faint" style="font-size:11px">${rel(a.created_at)}</div></div>`).join('')}</div>` : ''}
    <div class="card box"><h3>フレンド（${S.friends.length}）</h3>${S.friends.length ? S.friends.map(f => `<div class="li">${ava(f, 42)}<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px" class="ellip">${esc(f.name)}</div><div class="faint ellip" style="font-size:12px">${f.last_post ? `🎵 ${esc(f.last_post.title)} · ${rel(f.last_post.created_at)}` : esc(f.bio || 'まだシェアなし')}</div></div><button class="btn g sm" data-act="chat" data-id="${esc(f.id)}">DM</button><button class="icon-btn" style="width:32px;height:32px;background:none;border:none" data-act="friend-menu" data-id="${esc(f.id)}">${I.more}</button></div>`).join('') : `<div class="faint" style="font-size:13px">まだいません。招待リンクを送ってみよう</div>`}</div>
    <div class="sec"><span class="lbl">シェアした曲</span></div>
    ${S.mine.length ? S.mine.map(x => `<div class="res" data-act="open-post" data-id="${x.id}">${art(x)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(x.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(x.artist)}</div></div><div style="text-align:right"><div style="font-size:18px">${esc(splitMood(x.mood)[0])}</div><div class="faint" style="font-size:10.5px">${rel(x.created_at)}</div></div></div>`).join('') : `<div class="empty" style="padding-top:20px"><span class="e-ic">🎵</span>まだシェアした曲はありません</div>`}
    <div style="height:90px"></div>`;
}

// ═══════════════════════ SETTINGS ═══════════════════════
function openSettings() {
  const u = api.user() || {}; const p = S.profile;
  const pushOn = localStorage.getItem('hm_push') === '1' && Notification?.permission === 'granted';
  $('#pg-settings').innerHTML = `<div class="page-hd"><button class="back" data-act="close-page">${I.back}</button><div class="ttl disp" style="font-size:18px">設定</div></div>
  <div class="page-body">
    <div class="set-title">プロフィール</div>
    <div class="set-group" style="padding:18px">
      <div class="ava-pick" data-act="pick-photo">${ava(EDIT.avatar !== undefined ? { ...p, avatar: EDIT.avatar, emoji: EDIT.emoji } : p, 96)}<div class="cam">${I.camera}</div></div>
      <div class="emos">${['🎧', '🎵', '🌙', '☀️', '🌊', '🌸', '⚡', '🦋', '🐧', '🍂', '☁️', '🌿'].map(e => `<button class="emo ${(EDIT.emoji ?? p.emoji) === e && !(EDIT.avatar ?? p.avatar) ? 'on' : ''}" data-act="edit-emoji" data-e="${e}">${e}</button>`).join('')}</div>
      <input class="inp" id="ed-name" maxlength="20" placeholder="ニックネーム" value="${esc(EDIT.name ?? p.name)}" style="margin-bottom:8px">
      <input class="inp" id="ed-bio" maxlength="40" placeholder="ひとこと自己紹介" value="${esc(EDIT.bio ?? p.bio)}">
      <button class="btn p w" style="margin-top:12px" data-act="save-profile">保存</button>
    </div>
    <div class="set-title">アカウント</div>
    <div class="set-group">
      <div class="set-row"><div class="grow">${u.anonymous ? '匿名アカウント' : esc(u.email || 'ログイン中')}<small>${u.anonymous ? 'この端末にだけ保存されています。機種変更に備えてメールを登録しよう' : 'メールでほかの端末からもログインできます'}</small></div></div>
      ${u.anonymous ? `<div class="set-row" data-act="link-email"><div class="grow">📧 メールで引き継ぎ設定</div><span class="faint">›</span></div>` : ''}
      ${GOOGLE_LOGIN && u.anonymous ? `<div class="set-row" data-act="link-google"><div class="grow">Googleアカウントと連携</div><span class="faint">›</span></div>` : ''}
      ${!u.anonymous ? `<div class="set-row" data-act="logout"><div class="grow">ログアウト</div></div>` : ''}
    </div>
    <div class="set-title">通知</div>
    <div class="set-group">
      <div class="set-row" data-act="toggle-push"><div class="grow">プッシュ通知<small>DMと、毎日の「hearmeの時間」をお知らせ</small></div><div class="sw ${pushOn ? 'on' : ''}"></div></div>
      ${isIOS && !standalone ? `<div class="set-row"><div class="grow" style="font-size:13px;color:var(--tx2);line-height:1.6">iPhoneで通知を受け取るには、Safariの共有ボタン <b>⬆︎</b> →「<b>ホーム画面に追加</b>」して、ホーム画面のアイコンから開いてください</div></div>` : ''}
    </div>
    <div class="set-title">安全</div>
    <div class="set-group">
      <div class="set-row" data-act="unblock"><div class="grow">ブロックをすべて解除</div></div>
      <div class="set-row"><div class="grow" style="font-size:13px;color:var(--tx2);line-height:1.7">・DMはフレンドどうしだけ<br>・「みんな」では名前が出ません<br>・困ったら投稿の「…」から通報・ブロック</div></div>
    </div>
    ${!LIVE ? `<div class="set-title">デモ</div><div class="set-group"><div class="set-row" data-act="demo-moment"><div class="grow">⚡ hearmeの時間を試す</div></div><div class="set-row" data-act="demo-reset"><div class="grow">デモデータをリセット</div></div></div>` : ''}
    <div class="set-title">hearme</div>
    <div class="set-group">
      <a class="set-row" style="color:inherit;text-decoration:none" href="https://hearme.readdy.co/" target="_blank" rel="noopener"><div class="grow">hearmeについて</div><span class="faint">↗</span></a>
      <div class="set-row" data-act="delete-me"><div class="grow" style="color:var(--rs)">アカウントを削除</div></div>
    </div>
    <div class="faint" style="text-align:center;font-size:11px;padding:20px">hearme v${VERSION}${LIVE ? '' : ' · デモ'}</div>
  </div>`;
}
const EDIT = {};
function resetEdit() { for (const k in EDIT) delete EDIT[k]; }

// ═══════════════════════ PHOTO ═══════════════════════
function pickPhoto() {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => {
      const f = i.files?.[0]; if (!f) return res(null);
      const r = new FileReader();
      r.onload = e => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = c.height = 240;
          const m = Math.min(img.width, img.height);
          c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 240, 240);
          res(c.toDataURL('image/jpeg', .8));
        };
        img.onerror = () => { toast('画像を読み込めませんでした'); res(null); };
        img.src = e.target.result;
      };
      r.readAsDataURL(f);
    };
    i.click();
  });
}

// ═══════════════════════ PUSH ═══════════════════════
function b64ToU8(b) { const p = '='.repeat((4 - b.length % 4) % 4); const r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); }
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (isIOS && !standalone) { toast('ホーム画面に追加したアプリから\nオンにできます'); return false; }
    toast('このブラウザは通知に対応していません'); return false;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('通知が許可されませんでした。端末の設定から許可してね'); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY) });
    await api.savePush(sub);
    localStorage.setItem('hm_push', '1'); toast('🔔 通知をオンにしました'); return true;
  } catch (e) { toast('通知を設定できませんでした'); console.error(e); return false; }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    if (sub) { await api.removePush(sub.endpoint); await sub.unsubscribe(); }
  } catch { /* */ }
  localStorage.removeItem('hm_push'); toast('通知をオフにしました');
}

// ═══════════════════════ FRIENDS / INVITE ═══════════════════════
async function shareInvite() {
  const url = inviteURL();
  const text = `hearmeで「今日の1曲」を交換しよう🎧\n招待コード: ${S.profile?.code}`;
  if (navigator.share) { try { await navigator.share({ title: 'hearme', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('招待リンクをコピーしました'); } catch { toast(url); }
}
function openAddFriend() {
  openSheet(`<div style="padding:4px 22px 26px">
    <div class="disp" style="font-size:22px;text-align:center">フレンドを追加</div>
    <div class="muted" style="font-size:13px;text-align:center;margin:6px 0 18px;line-height:1.6">招待コードを交換すると、お互いの曲が届き、DMができます</div>
    <div class="row" style="gap:8px"><input class="inp" id="fc" maxlength="6" placeholder="6文字のコード" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-family:var(--disp);font-size:20px;text-align:center"><button class="btn p" data-act="add-code" style="height:50px">追加</button></div>
    <div class="card" style="margin-top:18px;padding:16px;text-align:center"><div class="faint" style="font-size:12px">あなたのコード</div><div class="bigcode" style="font-size:30px;margin:6px 0 12px">${esc(S.profile?.code)}</div>
      <button class="btn g w" data-act="share-invite" style="height:44px">${I.share} 招待リンクを送る</button></div></div>`);
  setTimeout(() => $('#fc')?.focus(), 350);
}
async function addByCode(code, { silent } = {}) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) { toast('6文字のコードを入力してね'); return null; }
  try {
    const f = await api.addFriend(code); buzz([10, 30, 10]);
    if (!silent) toast(`✅ ${f.name} とフレンドになりました`);
    await Promise.all([loadFriends(), loadFeeds(), refreshThreads()]);
    return f;
  } catch (e) { toast(errText(e)); return null; }
}
function friendMenu(id) {
  const f = S.friends.find(x => x.id === id); if (!f) return;
  openSheet(`<div style="padding:0 18px 24px"><div class="row" style="padding:4px 4px 16px">${ava(f, 48)}<div><div style="font-weight:700;font-size:16px">${esc(f.name)}</div><div class="faint" style="font-size:12px">${esc(f.bio || 'フレンド')}</div></div></div>
    <button class="btn g w" data-act="chat" data-id="${esc(id)}">💬 DMを送る</button>
    <button class="btn g w" style="margin-top:8px" data-act="unfriend" data-id="${esc(id)}">フレンドを解除</button>
    <button class="btn d w" style="margin-top:8px" data-act="block" data-id="${esc(id)}">ブロック</button>
    <button class="btn g w" style="margin-top:8px" data-act="report-user" data-id="${esc(id)}">通報</button></div>`);
}
function postMenu(id) {
  const p = S.posts.get(id); if (!p) return;
  if (p.mine) {
    openSheet(`<div style="padding:0 18px 24px"><button class="btn d w" data-act="del-post" data-id="${p.id}">この投稿を削除</button></div>`); return;
  }
  openSheet(`<div style="padding:0 18px 24px">
    <button class="btn g w" data-act="report-post" data-id="${p.id}">🚩 この投稿を通報</button>
    <button class="btn d w" style="margin-top:8px" data-act="block-author" data-id="${p.id}">この人をブロック</button>
    <div class="faint" style="font-size:12px;text-align:center;margin-top:12px">ブロックすると、お互いの投稿が見えなくなります</div></div>`);
}

// ═══════════════════════ MOMENT ═══════════════════════
function showMoment() {
  const left = momentActive(); if (!left) return;
  if (postedToday().some(p => p.on_time)) return;
  if (sessionStorage.getItem('hm_moment_seen') === S.moment.at) return;
  sessionStorage.setItem('hm_moment_seen', S.moment.at);
  const ov = $('#moment-ov');
  ov.innerHTML = `<div class="pulse"><img src="/logo-mark.png" alt=""></div><div class="disp" style="font-size:26px">⚡ hearmeの時間！</div><div class="muted" style="font-size:14px;line-height:1.7">フレンドも今この瞬間、曲を選んでいます。<br>10分以内にシェアすると「オンタイム」</div><div class="t" data-countdown>${fmtLeft(left)}</div><button class="btn p" style="width:100%;max-width:300px;height:54px" data-act="moment-go">今の1曲をシェア</button><button class="faint" style="padding:12px;font-size:13px" data-act="moment-skip">あとで</button>`;
  ov.classList.add('on'); buzz([30, 60, 30]);
}
function hideMoment() { $('#moment-ov').classList.remove('on'); }
setInterval(() => {
  const l = momentActive();
  $$('[data-countdown]').forEach(e => { e.textContent = fmtLeft(l); });
  if (!l && $('#moment-ov').classList.contains('on')) hideMoment();
}, 1000);

// ═══════════════════════ PLAYER UI ═══════════════════════
music.player.subscribe(st => {
  const m = $('#mini');
  if (!st.song) { m.classList.remove('on'); }
  else {
    m.classList.add('on');
    m.innerHTML = `${art(st.song)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:13.5px;font-weight:600">${esc(st.song.title)}</div><div class="ellip muted" style="font-size:11.5px">${esc(st.song.artist)} · 試聴</div></div><button class="play" data-act="play" data-src="${esc(st.song.preview_url)}">${st.playing ? I.pause : I.play}</button><button class="icon-btn" style="width:34px;height:34px;background:none;border:none" data-act="stop">${I.x.replace('<svg', '<svg width="16" height="16"')}</button><div class="bar" style="width:${(st.t / (st.d || 30)) * 100}%"></div>`;
  }
  $$('button.play[data-src]').forEach(b => { if (b.closest('#mini')) return; const on = st.song && b.dataset.src === st.song.preview_url && st.playing; const want = on ? I.pause : I.play; if (b.innerHTML !== want) b.innerHTML = want; });
  updateProgress();
});
function updateProgress() {
  const st = music.player.state();
  $$('[data-prog]').forEach(p => { p.firstElementChild.style.width = st.song && p.dataset.prog === st.song.preview_url ? `${(st.t / (st.d || 30)) * 100}%` : '0'; });
}
function songBySrc(src) {
  for (const p of S.posts.values()) if (p.preview_url === src) return p;
  for (const s of [...S.chart, ...C.results, ...X.results]) if (s.preview_url === src) return s;
  for (const m of S.chat?.msgs || []) if (m.song?.preview_url === src) return m.song;
  const st = music.player.state(); if (st.song?.preview_url === src) return st.song;
  return null;
}

// ═══════════════════════ ACTIONS ═══════════════════════
const A = {
  tab: el => setTab(el.dataset.tab),
  mode: async el => { S.mode = el.dataset.m; buzz(5); renderHome(); if (S.mode === 'public' && !S.loaded.pub) await loadPublic(); },
  compose: () => { hideMoment(); openComposer(); },
  'close-sheet': () => closeSheet(),
  'close-page': () => closePage(),
  play: el => { const s = songBySrc(el.dataset.src); if (s) { buzz(5); music.player.toggle(s); } },
  stop: () => music.player.stop(),
  pick: el => { C.song = C.results[+el.dataset.i]; buzz(6); renderComposer(); },
  unpick: () => { C.song = null; renderComposer(); setTimeout(() => $('#cmp-q')?.focus(), 50); },
  mood: el => { C.mood = el.dataset.m; buzz(5); $$('.md').forEach(b => b.classList.toggle('on', b === el)); $('#cmp-go').disabled = !(C.song && C.mood); },
  pubtoggle: el => { C.pub = !C.pub; el.querySelector('.sw').classList.toggle('on', C.pub); buzz(5); },
  post: () => submitPost(),
  'open-post': el => openPost(el.dataset.id),
  'post-menu': el => postMenu(el.dataset.id),
  react: async el => {
    const p = S.posts.get(el.dataset.id); if (!p) return;
    const e = el.dataset.e; const prev = p.my_reaction; const next = prev === e ? null : e;
    p.reactions = { ...(p.reactions || {}) };
    if (prev) { p.reactions[prev] = Math.max(0, (p.reactions[prev] || 1) - 1); if (!p.reactions[prev]) delete p.reactions[prev]; }
    if (next) p.reactions[next] = (p.reactions[next] || 0) + 1;
    p.my_reaction = next; buzz(next ? 10 : 4);
    $$(`[data-act="react"][data-id="${p.id}"]`).forEach(b => {
      const em = b.dataset.e, n = p.reactions[em] || 0; b.classList.toggle('on', p.my_reaction === em);
      b.innerHTML = `${em}${n ? `<b>${n}</b>` : ''}`; if (em === next) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    });
    try {
      await api.react(p.id, next);
      // フレンドの投稿へのリアクションはDMにも残す
      if (next && !p.mine && p.author?.id && S.friends.some(f => f.id === p.author.id)) {
        api.send(p.author.id, '', { title: p.title, artist: p.artist, artwork: p.artwork, preview_url: p.preview_url, track_url: p.track_url, reaction: next, post_id: p.id }).catch(() => {});
      }
    } catch (err) { toast(errText(err)); }
  },
  reply: async el => {
    const p = S.posts.get(el.dataset.id); const t = $('#reply'); const body = t.value.trim(); if (!body || !p) return;
    el.disabled = true;
    try {
      await api.send(p.author.id, body, { title: p.title, artist: p.artist, artwork: p.artwork, preview_url: p.preview_url, track_url: p.track_url, reply_to: p.id });
      closeSheet(); toast(`💬 ${p.author.name} に送りました`); refreshThreads();
    } catch (e) { toast(errText(e)); el.disabled = false; }
  },
  'del-post': async el => {
    const ok = await confirmSheet({ title: '投稿を削除しますか？', text: 'リアクションも一緒に消えます', ok: '削除', danger: true }); if (!ok) return;
    try { await api.deletePost(el.dataset.id); toast('削除しました'); await loadFeeds(); } catch (e) { toast(errText(e)); }
  },
  'share-song': el => { const p = S.posts.get(el.dataset.id); closeSheet(); setTimeout(() => openComposer({ ...p }), 350); },
  'share-this': el => { try { openComposer(JSON.parse(el.dataset.song)); } catch { /* */ } },
  'ex-clear': () => { X.q = ''; X.results = []; renderExplore(); },
  'my-latest': () => { const p = S.mine[0]; if (p) openPost(p.id); },
  'friend-latest': el => {
    const p = S.feed.find(x => x.author?.id === el.dataset.id && isToday(x.created_at));
    if (p) openPost(p.id); else { const f = S.friends.find(x => x.id === el.dataset.id); toast(`${f?.name || 'フレンド'}はまだ今日シェアしていません`); }
  },
  'add-friend': () => openAddFriend(),
  'add-code': async () => { const f = await addByCode($('#fc').value); if (f) closeSheet(); },
  'share-invite': () => shareInvite(),
  'copy-code': async () => { try { await navigator.clipboard.writeText(S.profile.code); toast('コードをコピーしました'); } catch { toast(S.profile.code); } },
  chat: el => { closeSheet(); openChat(el.dataset.id); },
  'chat-send': () => chatSend(),
  'chat-song': () => openSongPicker(s => chatSend({ title: s.title, artist: s.artist, artwork: s.artwork, preview_url: s.preview_url, track_url: s.track_url, track_id: s.track_id })),
  'friend-menu': el => friendMenu(el.dataset.id),
  unfriend: async el => {
    const f = S.friends.find(x => x.id === el.dataset.id);
    if (!await confirmSheet({ title: `${f?.name}とのフレンドを解除？`, text: 'お互いの投稿が見えなくなり、DMもできなくなります', ok: '解除', danger: true })) return;
    await api.removeFriend(el.dataset.id).catch(e => toast(errText(e)));
    if (S.chat) closePage('pg-chat');
    toast('フレンドを解除しました'); await Promise.all([loadFriends(), loadFeeds(), refreshThreads()]);
  },
  block: async el => {
    if (!await confirmSheet({ title: 'ブロックしますか？', text: 'フレンドも解除され、お互いの投稿とDMが届かなくなります', ok: 'ブロック', danger: true })) return;
    await api.blockUser(el.dataset.id).catch(e => toast(errText(e)));
    if (S.chat) closePage('pg-chat');
    toast('ブロックしました'); await Promise.all([loadFriends(), loadFeeds(), refreshThreads()]);
  },
  'block-author': async el => {
    if (!await confirmSheet({ title: 'この人をブロック？', text: 'この人の投稿は表示されなくなります', ok: 'ブロック', danger: true })) return;
    await api.blockPostAuthor(el.dataset.id).catch(e => toast(errText(e)));
    toast('ブロックしました'); await Promise.all([loadFriends(), loadFeeds()]);
  },
  'report-post': async el => { await api.report({ postId: el.dataset.id, reason: 'post' }).catch(() => {}); closeSheet(); toast('通報しました。ありがとう'); },
  'report-user': async el => { await api.report({ userId: el.dataset.id, reason: 'user' }).catch(() => {}); closeSheet(); toast('通報しました。ありがとう'); },
  settings: () => { resetEdit(); openSettings(); openPage('pg-settings'); },
  'pick-photo': async () => { const d = await pickPhoto(); if (d) { EDIT.avatar = d; openSettings(); } },
  'edit-emoji': el => { EDIT.emoji = el.dataset.e; EDIT.avatar = null; EDIT.name = $('#ed-name').value; EDIT.bio = $('#ed-bio').value; openSettings(); },
  'save-profile': async el => {
    const name = $('#ed-name').value.trim(); if (!name) { toast('ニックネームを入力してね'); return; }
    el.disabled = true;
    const patch = { name, bio: $('#ed-bio').value.trim() };
    if (EDIT.emoji !== undefined) patch.emoji = EDIT.emoji;
    if (EDIT.avatar !== undefined) patch.avatar = EDIT.avatar;
    try { S.profile = await api.updateProfile(patch); resetEdit(); toast('✅ 保存しました'); openSettings(); render(); }
    catch (e) { toast(errText(e)); el.disabled = false; }
  },
  'toggle-push': async el => {
    const sw = el.querySelector('.sw');
    if (sw.classList.contains('on')) { await disablePush(); sw.classList.remove('on'); }
    else if (await enablePush()) sw.classList.add('on');
  },
  unblock: async () => { if (!await confirmSheet({ title: 'ブロックをすべて解除？', ok: '解除' })) return; await api.unblockAll().catch(() => {}); toast('解除しました'); loadFeeds(); },
  'link-email': () => emailFlow({ link: true }),
  'link-google': () => api.google({ link: true }).catch(e => toast(errText(e))),
  logout: async () => { if (!await confirmSheet({ title: 'ログアウトしますか？', ok: 'ログアウト' })) return; await api.signOut(); location.replace('/'); },
  'delete-me': async () => {
    if (!await confirmSheet({ title: 'アカウントを削除しますか？', text: '投稿・フレンド・DMがすべて消え、元に戻せません', ok: '削除する', danger: true })) return;
    if (!await confirmSheet({ title: '本当に削除しますか？', text: 'この操作は取り消せません', ok: '完全に削除', danger: true })) return;
    try { await disablePush(); await api.deleteMe(); localStorage.clear(); location.replace('/'); } catch (e) { toast(errText(e)); }
  },
  'demo-moment': () => { api.fireMoment?.(); },
  'demo-reset': async () => { if (!await confirmSheet({ title: 'デモデータをリセット？', ok: 'リセット', danger: true })) return; await api.signOut(); location.replace('/'); },
  'moment-go': () => { hideMoment(); openComposer(); },
  'moment-skip': () => hideMoment(),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) {
    const f = e.target.closest('.msg.failed'); if (f) retryFailed(f.dataset.mid);
    return;
  }
  const fn = A[el.dataset.act]; if (!fn) return;
  if (el.dataset.act === 'play' || el.closest('.play')) e.stopPropagation();
  fn(el, e);
});
function retryFailed(mid) {
  const c = S.chat; if (!c) return; const m = c.msgs.find(x => String(x.id) === mid); if (!m) return;
  c.msgs.splice(c.msgs.indexOf(m), 1);
  if (m.song) chatSend(m.song); else { $('#chat-in').value = m.body; chatSend(); }
}

// ═══════════════════════ DATA ═══════════════════════
async function loadFriends() { try { S.friends = await api.friends(); } catch (e) { console.warn(e); } }
async function loadFeeds() {
  try {
    const [feed, mine] = await Promise.all([api.friendFeed(), api.myPosts()]);
    S.feed = remember(feed); S.mine = remember(mine); S.loaded.feed = S.loaded.mine = true;
    // 相手から追加されたフレンドを取りこぼさない
    if (feed.some(p => !p.mine && p.author?.id && !S.friends.some(f => f.id === p.author.id))) await loadFriends();
  } catch (e) { toast(errText(e)); }
  if (S.mode === 'public' || S.loaded.pub) await loadPublic(true);
  render();
}
async function loadPublic(silent) {
  try { S.pub = remember(await api.publicFeed()); S.loaded.pub = true; } catch (e) { if (!silent) toast(errText(e)); }
  if (!silent) render();
}
async function refreshThreads() {
  try { S.threads = await api.threads(); S.loaded.threads = true; } catch (e) { console.warn(e); }
  badges(); if (S.tab === 'dm') renderDM();
}
async function refreshMe() {
  try { S.activity = await api.activity(); } catch { /* */ }
  badges(); if (S.tab === 'me') renderMe();
}
async function loadMoment() {
  try { S.moment = await api.todayMoment(); } catch { S.moment = null; }
  if (momentActive()) { showMoment(); if (S.tab === 'home') renderHome(); }
}
async function enrichDemo() {
  // デモ投稿にジャケット写真と試聴を付ける
  const need = api.db.posts.filter(p => !p.artwork && p.user_id !== api.uid);
  if (!need.length) return;
  for (const row of need) {
    try {
      const [s] = await music.search(`${row.title} ${row.artist}`, { limit: 3 });
      if (s) Object.assign(row, { artwork: s.artwork, preview_url: s.preview_url, track_url: s.track_url, track_id: s.track_id });
    } catch { /* */ }
  }
  api.save(); await loadFeeds();
}

// ═══════════════════════ REALTIME ═══════════════════════
function wireRealtime() {
  api.on('message', async m => {
    if (S.chat && m.sender === S.chat.peer.id) {
      if (!S.chat.msgs.some(x => x.id === m.id)) S.chat.msgs.push(m);
      S.chat.typingUntil = 0; drawChat(); api.markRead(m.sender).catch(() => {}); buzz(6);
    } else {
      let f = S.friends.find(x => x.id === m.sender);
      if (!f) { await loadFriends(); f = S.friends.find(x => x.id === m.sender); if (S.tab === 'home') renderHome(); }
      const txt = m.song?.reaction ? `${m.song.reaction} 「${m.song.title}」にリアクション` : m.song ? `🎵 ${m.song.title}` : m.body;
      if (document.visibilityState === 'visible') toast(`💬 ${f?.name || 'フレンド'}：${String(txt).slice(0, 40)}`);
      buzz(10);
    }
    refreshThreads();
  });
  api.on('read', m => {
    if (!S.chat) return; const x = S.chat.msgs.find(y => y.id === m.id);
    if (x) { x.read_at = m.read_at; drawChat(); }
  });
  api.on('reaction', async r => {
    const p = S.posts.get(r?.post_id);
    if (p?.mine && r?.emoji) { toast(`${r.emoji} 「${p.title}」にリアクションが届きました`); buzz(8); }
    await Promise.all([loadFeeds(), refreshMe()]);
  });
  let pT; api.on('post', () => { clearTimeout(pT); pT = setTimeout(loadFeeds, 600); });
  api.on('moment', m => { S.moment = { at: m.at }; showMoment(); render(); });
}

// ═══════════════════════ ONBOARDING / AUTH ═══════════════════════
const OB = { step: 'welcome', emoji: '🎧', avatar: null, name: '', bio: '' };
function showOB(step) { OB.step = step; $('#ob').classList.remove('hide'); renderOB(); }
function renderOB() {
  const ob = $('#ob'); const st = OB.step;
  const dots = n => `<div class="dots">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  if (st === 'welcome') {
    ob.innerHTML = `<div class="ob-inner"><div class="welcome"><img src="/logo-mark.png" alt=""><h1>hearme</h1><div class="tag">きもちを、音楽で届ける</div><div class="wave">${[5, 12, 20, 9, 24, 13, 6].map((h, i) => `<i style="height:${h}px;animation-delay:${i * .1}s"></i>`).join('')}</div>
      <div class="muted" style="font-size:13.5px;line-height:1.9;margin-top:34px">言葉にしにくい今日の気分を、1曲で。<br>フレンドと、静かにつながる場所。</div></div>
      <button class="btn p w" style="height:54px" data-ob="start">はじめる</button>
      <button class="btn w" style="margin-top:6px;color:var(--tx2)" data-ob="login">アカウントをお持ちの方</button>
      ${pendingInvite() ? `<div class="faint" style="text-align:center;font-size:12px;margin-top:8px">🎟 招待コード ${esc(pendingInvite())} を受け取りました</div>` : ''}</div>`;
  } else if (st === 'profile') {
    ob.innerHTML = `<div class="ob-inner">${dots(1)}<h2>はじめまして👋</h2><p class="sub">フレンドに表示される名前とアイコンを決めよう</p>
      <div class="ava-pick" data-ob="photo">${ava({ emoji: OB.emoji, avatar: OB.avatar }, 96)}<div class="cam">${I.camera}</div></div>
      <div class="emos">${['🎧', '🎵', '🌙', '☀️', '🌊', '🌸', '⚡', '🦋', '🐧', '🍂', '☁️', '🌿'].map(e => `<button class="emo ${OB.emoji === e && !OB.avatar ? 'on' : ''}" data-ob="emoji" data-e="${e}">${e}</button>`).join('')}</div>
      <input class="inp" id="ob-name" maxlength="20" placeholder="ニックネーム" value="${esc(OB.name)}" style="margin-bottom:8px">
      <input class="inp" id="ob-bio" maxlength="40" placeholder="ひとこと（任意）例：夜はローファイ" value="${esc(OB.bio)}">
      <div style="flex:1;min-height:24px"></div><button class="btn p w" style="height:54px" data-ob="save-profile">次へ</button></div>`;
  } else if (st === 'invite') {
    ob.innerHTML = `<div class="ob-inner">${dots(2)}<h2>フレンドとつながる🔑</h2><p class="sub">招待リンクを送るか、相手のコードを入れよう。どちらか一方でOK、お互いフレンドになります</p>
      ${OB.added ? `<div class="card row" style="padding:14px;margin-bottom:16px;border-color:rgba(62,207,197,.35)">${ava(OB.added, 44)}<div style="flex:1"><b>${esc(OB.added.name)}</b><div class="muted" style="font-size:12px">とフレンドになりました 🎉</div></div></div>` : ''}
      <div class="card" style="padding:18px;text-align:center"><div class="faint" style="font-size:12px">あなたのコード</div><div class="bigcode">${esc(S.profile?.code)}</div><button class="btn p w" style="height:46px" data-ob="share">${I.share} 招待リンクを送る</button></div>
      <div class="faint" style="font-size:12px;margin:22px 0 8px">友達のコードを入れる</div>
      <div class="row" style="gap:8px"><input class="inp" id="ob-fc" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-family:var(--disp);font-size:20px;text-align:center"><button class="btn g" style="height:50px" data-ob="add">追加</button></div>
      <div style="flex:1;min-height:24px"></div><button class="btn p w" style="height:54px" data-ob="to-notify">次へ</button></div>`;
  } else if (st === 'notify') {
    const canPush = 'PushManager' in window && 'serviceWorker' in navigator;
    ob.innerHTML = `<div class="ob-inner">${dots(3)}<h2>毎日1回の<br>「hearmeの時間」⚡</h2><p class="sub">1日1回、ランダムな時間にみんなへ一斉に通知が届きます。10分以内にシェアすると「オンタイム」。DMが届いたときもお知らせします</p>
      <div class="card" style="padding:20px;text-align:center;margin-bottom:12px"><div style="font-size:44px;margin-bottom:6px">🔔</div><div class="muted" style="font-size:13px;line-height:1.7">${canPush ? '通知をオンにして、大事な瞬間を逃さないで' : isIOS ? 'iPhoneでは、Safariの共有ボタン ⬆︎ →「<b>ホーム画面に追加</b>」してから開くと通知を受け取れます' : 'このブラウザでは通知が使えません'}</div></div>
      <div style="flex:1;min-height:24px"></div>
      ${canPush ? `<button class="btn p w" style="height:54px" data-ob="push">通知をオンにする</button>` : ''}
      <button class="btn ${canPush ? '' : 'p'} w" style="margin-top:6px;${canPush ? 'color:var(--tx2)' : 'height:54px'}" data-ob="finish">${canPush ? 'あとで' : 'はじめる'}</button></div>`;
  } else if (st === 'login') {
    ob.innerHTML = `<div class="ob-inner"><button class="back" data-ob="to-welcome" style="margin-left:-8px">${I.back}</button><h2 style="margin-top:14px">ログイン</h2><p class="sub">登録したメールアドレスに6桁のコードを送ります</p>
      <div id="email-box"></div>
      ${GOOGLE_LOGIN ? `<div class="faint" style="text-align:center;font-size:12px;margin:18px 0">または</div><button class="btn g w" data-ob="google">Googleで続ける</button>` : ''}</div>`;
    emailFlow({ link: false, mount: $('#email-box') });
  }
}
function pendingInvite() { return sessionStorage.getItem('hm_inv') || ''; }

// メールの6桁コード（ログイン / 匿名アカウントの引き継ぎ 共通）
function emailFlow({ link, mount }) {
  const inSheet = !mount;
  if (inSheet) { openSheet(`<div style="padding:4px 22px 26px"><div class="disp" style="font-size:22px;text-align:center">メールで引き継ぎ</div><div class="muted" style="font-size:13px;text-align:center;margin:6px 0 18px;line-height:1.6">メールを登録すると、機種変更してもログインできます</div><div id="email-box"></div></div>`); mount = $('#email-box'); }
  let email = '';
  const step1 = () => {
    mount.innerHTML = `<input class="inp" id="em" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"><button class="btn p w" style="margin-top:10px;height:52px" id="em-go">コードを送る</button>`;
    setTimeout(() => $('#em')?.focus(), 300);
    $('#em-go').onclick = async () => {
      email = $('#em').value.trim(); if (!/^\S+@\S+\.\S+$/.test(email)) { toast('メールアドレスを確認してね'); return; }
      $('#em-go').disabled = true; $('#em-go').textContent = '送信中…';
      try { await api.sendEmailCode(email, { link }); step2(); }
      catch (e) { toast(errText(e)); $('#em-go').disabled = false; $('#em-go').textContent = 'コードを送る'; }
    };
  };
  const step2 = () => {
    mount.innerHTML = `<div class="card" style="padding:14px;margin-bottom:12px;font-size:13px;line-height:1.7"><b>📩 ${esc(email)} にメールを送りました</b><br>${link ? 'メール内のリンクを開くと登録が完了します。完了したらこの画面に戻ってきてね' : 'メール内のリンクを開くとログインできます'}<br><span class="faint">届かないときは迷惑メールフォルダも見てね</span></div><div class="faint" style="font-size:12px;margin-bottom:8px">メールに6桁のコードが書いてある場合はこちら${LIVE ? '' : '（デモ：何でも6桁でOK）'}</div><input class="inp otp" id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"><button class="btn p w" style="margin-top:10px;height:52px" id="otp-go">確認</button><button class="btn w faint" style="margin-top:4px" id="otp-back">メールを入れ直す</button>`;
    const o = $('#otp'); setTimeout(() => o.focus(), 200);
    o.oninput = () => { if (o.value.length === 6) $('#otp-go').click(); };
    $('#otp-back').onclick = step1;
    $('#otp-go').onclick = async () => {
      const b = $('#otp-go'); b.disabled = true; b.textContent = '確認中…';
      try {
        S.user = await api.verifyEmailCode(email, o.value.trim(), { link });
        if (link) { closeSheet(); toast('✅ メールを登録しました'); openSettings(); return; }
        S.profile = await api.myProfile();
        if (S.profile) { $('#ob').classList.add('hide'); startApp(); } else showOB('profile');
      } catch (e) { toast(errText(e)); b.disabled = false; b.textContent = '確認'; }
    };
  };
  step1();
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-ob]'); if (!el) return;
  const a = el.dataset.ob;
  if (a === 'start') {
    el.disabled = true;
    try { if (!api.user()) S.user = await api.signInAnon(); showOB('profile'); }
    catch (err) { toast(errText(err)); el.disabled = false; }
  } else if (a === 'login') showOB('login');
  else if (a === 'to-welcome') showOB('welcome');
  else if (a === 'google') api.google({ link: false }).catch(err => toast(errText(err)));
  else if (a === 'emoji') { OB.emoji = el.dataset.e; OB.avatar = null; OB.name = $('#ob-name').value; OB.bio = $('#ob-bio').value; renderOB(); }
  else if (a === 'photo') { OB.name = $('#ob-name').value; OB.bio = $('#ob-bio').value; const d = await pickPhoto(); if (d) { OB.avatar = d; renderOB(); } }
  else if (a === 'save-profile') {
    const name = $('#ob-name').value.trim(); if (!name) { toast('ニックネームを入力してね'); $('#ob-name').focus(); return; }
    el.disabled = true;
    try {
      S.profile = await api.createProfile({ name, bio: $('#ob-bio').value.trim(), emoji: OB.emoji, avatar: OB.avatar });
      const inv = pendingInvite();
      if (inv) { OB.added = await addByCode(inv, { silent: true }); sessionStorage.removeItem('hm_inv'); }
      showOB('invite');
    } catch (err) { toast(errText(err)); el.disabled = false; }
  } else if (a === 'share') shareInvite();
  else if (a === 'add') { const f = await addByCode($('#ob-fc').value, { silent: true }); if (f) { OB.added = f; renderOB(); } }
  else if (a === 'to-notify') showOB('notify');
  else if (a === 'push') { await enablePush(); finishOB(); }
  else if (a === 'finish') finishOB();
});
function finishOB() { $('#ob').classList.add('hide'); startApp(); }

// ═══════════════════════ BOOT ═══════════════════════
let started = false;
async function startApp() {
  if (started) return; started = true;
  $('#nav').classList.remove('hide');
  S.loaded.feed = false; render();
  wireRealtime(); api.start();
  await Promise.all([loadFriends(), loadFeeds(), refreshThreads(), refreshMe()]);
  S.seenActivity = +(localStorage.getItem('hm_seen_act') || S.activity.length);
  badges();
  await loadMoment();
  // 招待リンク（すでに登録済みの人）
  const inv = pendingInvite(); if (inv) { sessionStorage.removeItem('hm_inv'); await addByCode(inv); }
  handleDeepLink(new URLSearchParams(location.search));
  history.replaceState({}, '', '/');
  if (!LIVE) enrichDemo();
  // 戻ってきたら更新
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { api.refreshUser?.().then(u => { if (u && S.user?.email !== u.email) { S.user = u; if (pageStack.includes('pg-settings')) openSettings(); if (u.email && !u.anonymous) toast('✅ メールの登録が完了しました'); } }).catch(() => {}); loadFeeds(); refreshThreads(); loadMoment(); if (S.chat) api.messages(S.chat.peer.id).then(m => { if (S.chat) { S.chat.msgs = m; drawChat(); api.markRead(S.chat.peer.id); } }).catch(() => {}); }
  });
}
function handleDeepLink(q) {
  if (q.get('dm')) openChat(q.get('dm'));
  else if (q.get('moment')) { if (momentActive()) openComposer(); }
}
window.addEventListener('beforeunload', () => localStorage.setItem('hm_seen_act', S.seenActivity));
['scroll'].forEach(ev => addEventListener(ev, () => { if (scrollX || scrollY) scrollTo(0, 0); }));
$('#app').addEventListener('scroll', e => { if (e.target.id === 'app') e.target.scrollLeft = e.target.scrollTop = 0; });
addEventListener('online', () => { $('#net').classList.add('hide'); loadFeeds(); refreshThreads(); });
addEventListener('offline', () => $('#net').classList.remove('hide'));

async function boot() {
  const q = new URLSearchParams(location.search);
  const inv = (q.get('inv') || '').toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(inv)) sessionStorage.setItem('hm_inv', inv);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'open' && e.data.url) handleDeepLink(new URL(e.data.url, location.origin).searchParams);
    });
  }
  if (!navigator.onLine) $('#net').classList.remove('hide');
  try {
    const r = await api.init();
    S.user = r.user; S.profile = r.profile;
  } catch (e) { console.error(e); toast(errText(e)); }
  const sp = $('#splash'); sp.style.opacity = '0'; setTimeout(() => sp.remove(), 450);
  if (!S.user) showOB('welcome');
  else if (!S.profile) showOB('profile');
  else startApp();
}
boot();

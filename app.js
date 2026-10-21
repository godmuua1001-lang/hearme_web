// ═══════════════════════════════════════════════════════════════
// hearme v7 — きもちを、音楽で届ける
// ═══════════════════════════════════════════════════════════════
import { api, LIVE, errText } from './api.js';
import * as music from './music.js';
import { VAPID_PUBLIC_KEY, GOOGLE_LOGIN } from './config.js';
import * as CFG from './config.js';
const AI_ON = CFG.AI_ENABLED !== false && CFG.AI_ENABLED !== undefined ? true : false;

const VERSION = '10.5.3';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const buzz = (n = 8) => { try { navigator.vibrate?.(n); } catch { /* */ } };
// 画像は Apple の配信元か、端末で縮小したアイコンだけ表示する
const ART_RE = /^https:\/\/is\d+-ssl\.mzstatic\.com\//, PREVIEW_RE = /^https:\/\/audio-ssl\.itunes\.apple\.com\//, TRACK_RE = /^https:\/\/(music|itunes)\.apple\.com\//;
const safeImg = u => (typeof u === 'string' && (ART_RE.test(u) || /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(u))) ? u : null;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// 表示サイズ：v9.2の zoom 方式は iOS でスクロール・画面遷移が重くなったため廃止（小さい画面は CSS で調整）
const ZOOM = 1;
try { localStorage.removeItem('hm_ui'); } catch { /* */ }
// キーボードが出たら、下から出る画面をキーボードの上に持ち上げる
if (window.visualViewport) {
  const vv = visualViewport;
  const kb = () => {
    const h = Math.max(0, innerHeight - vv.height - vv.offsetTop); const open = h > 80;
    const r = document.documentElement.style;
    r.setProperty('--kb', (open ? h : 0) + 'px');
    // DM画面は「見えている範囲」にぴったり合わせる（入力欄が必ずキーボードの真上に来る）
    r.setProperty('--vvh', vv.height + 'px'); r.setProperty('--vvt', vv.offsetTop + 'px');
    document.body.classList.toggle('kb-open', open);
    const box = document.getElementById('chat');
    if (box && document.body.classList.contains('chat-open')) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  };
  vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb);
  kb();
}
// 開いた日数（インストール案内を2日目から出すため）
const launchDays = (() => { let n = 1; try { const t = new Date().toDateString(); const d = JSON.parse(localStorage.getItem('hm_days') || '[]'); if (!d.includes(t)) d.push(t); localStorage.setItem('hm_days', JSON.stringify(d.slice(-3))); n = d.length; } catch { /* */ } return () => n; })();

const MOODS = [
  ['😊', '嬉しい'], ['😌', '穏やか'], ['🤩', 'アガる'], ['🔥', '熱い'], ['🥰', 'すき'],
  ['😢', '悲しい'], ['🥺', '寂しい'], ['😤', 'モヤモヤ'], ['😴', '眠い'], ['💭', '考え中'],
];
const REACTS = ['❤️', '🫂', '✨'];   // v9.1：3つにしぼって線のアイコン＋ことば（DBの値は絵文字のまま）
const RX_META = {
  '❤️': { l: 'すき', svg: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>' },
  '🫂': { l: 'わかる', svg: '<path d="M4 13c2.5-1 5.5-1 8 1.5M20 13c-2.5-1-5.5-1-8 1.5"/><path d="M12 14.5V20M7 20h10"/><circle cx="12" cy="7" r="3"/>' },
  '✨': { l: 'いいね', svg: '<path d="M12 4l1.7 4.8L18.5 10.5l-4.8 1.7L12 17l-1.7-4.8L5.5 10.5l4.8-1.7z"/>' },
};
const rxInner = (e, n) => { const m = RX_META[e]; return m ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m.svg}</svg><span>${m.l}</span>${n ? `<b>${n}</b>` : ''}` : `${e}${n ? `<b>${n}</b>` : ''}`; };
const rxOthers = p => { if (!p.mine) return ''; const n = Object.entries(p.reactions || {}).filter(([e]) => !REACTS.includes(e)).reduce((a, [, v]) => a + v, 0); return n ? `<span class="rx-more">ほか ${n}</span>` : ''; };
// きもちの色：明るさをそろえ、虹の順（赤→橙→黄→緑→青→紫）に並べる
const MOOD_META = {
  '🔥': { label: '熱い', name: 'ほのお', c: '#F07A7A' }, '🤩': { label: 'アガる', name: 'ゆうやけ', c: '#F59E6B' },
  '😊': { label: '嬉しい', name: 'ひだまり', c: '#F5C76B' }, '😌': { label: '穏やか', name: 'わかば', c: '#8FD1B5' },
  '💭': { label: '考え中', name: 'きり', c: '#B8C4D6' }, '😢': { label: '悲しい', name: 'あおぞら', c: '#6FA0E6' },
  '😴': { label: '眠い', name: 'よぞら', c: '#7F8CC7' }, '🥺': { label: 'さみしい', name: 'すみれ', c: '#A08BE8' },
  '😤': { label: 'モヤモヤ', name: 'かすみ', c: '#B5A8C9' }, '🥰': { label: 'すき', name: 'さくら', c: '#F29BB8' },
};
const RAINBOW_ORDER = ['🔥', '🤩', '😊', '😌', '💭', '😢', '😴', '🥺', '😤', '🥰'];
const MOOD_COLOR = Object.fromEntries(Object.entries(MOOD_META).map(([e, m]) => [e, m.c]));
const moodOf = m => { const e = String(m || '').split(' ')[0]; const meta = MOOD_META[e]; return meta ? { e, ...meta } : { e, label: String(m || '').split(' ').slice(1).join(' ') || '—', c: '#C9C5BB', name: '' }; };
const moodChip = m => { const o = moodOf(m); return `<span class="mchip" style="--mc:${o.c}"><i></i>${esc(o.label)}</span>`; };

// ───────── icons ─────────
const I = {
  chat: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20.5 12a8 8 0 0 1-11.8 7L3.5 20.5 5 15.6A8 8 0 1 1 20.5 12z"/></svg>',
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
  headphones: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2.5" y="13" width="4" height="7" rx="1.5"/><rect x="17.5" y="13" width="4" height="7" rx="1.5"/></svg>',
  gift: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M12 9v11M3.5 13h17M12 9c-2-4-6-4-6-1.5S9.5 9 12 9zm0 0c2-4 6-4 6-1.5S14.5 9 12 9z"/></svg>',
  spark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
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
  if (!s?.preview_url || !PREVIEW_RE.test(s.preview_url)) return '';
  const on = music.player.isCurrent(s) && music.player.state().playing;
  return `<button class="play ${cls}" data-act="play" data-src="${esc(s.preview_url)}"${s.id && S.posts.get(s.id) === s ? ` data-post="${esc(s.id)}"` : ''} aria-label="試聴">${on ? I.pause : I.play}</button>`;
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
  const sh = $('#sheet'); sh.style.transition = ''; sh.style.transform = '';   // ドラッグ途中の位置で止まらないように
  sh.classList.remove('on'); $('#sheet-bg').classList.remove('on');
  document.activeElement?.blur?.();
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
    if (e.target.closest('input,textarea,#mood-pad')) { y0 = null; return; }
    if (e.target.closest('.grab') || body.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }
  }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (y0 == null) return; dy = e.touches[0].clientY - y0;
    if (dy > 0 && ($('#sheet-body').scrollTop <= 0 || e.target.closest('.grab'))) sh.style.transform = `translateY(${dy}px)`;
    else if (dy < 0) { y0 = null; sh.style.transform = ''; sh.style.transition = ''; }
  }, { passive: true });
  const end = () => {
    if (y0 == null) return; sh.style.transition = '';
    if (dy > 90) closeSheet(); else sh.style.transform = '';
    y0 = null; dy = 0;
  };
  sh.addEventListener('touchend', end);
  sh.addEventListener('touchcancel', () => { if (y0 == null) return; sh.style.transition = ''; sh.style.transform = ''; y0 = null; dy = 0; });
})();

// ═══════════════════════ PAGES (スワイプで戻る) ═══════════════════════
const pageStack = [];
function openPage(id) {
  const pg = $('#' + id); pg.classList.add('on'); pg.style.transform = '';
  if (pageStack.includes(id)) pageStack.splice(pageStack.indexOf(id), 1);
  pageStack.push(id); pg.style.zIndex = 70 + pageStack.length;   // あとから開いた画面が必ず上
  history.pushState({ hm: 'page', id }, '');
}
function closePage(id = pageStack[pageStack.length - 1], fromPop = false) {
  if (!id) return;
  const pg = $('#' + id); pg.classList.remove('on'); pg.style.transform = '';
  pageStack.splice(pageStack.indexOf(id), 1);
  if (id === 'pg-chat') leaveChat();
  if (!fromPop) history.back();
}
// 戻る操作（iPhoneのスワイプ・Androidの戻るボタン）：アプリの外に出たり、再読み込みでホームに戻ったりしないようにする
addEventListener('popstate', e => {
  const atBase = e.state?.hm === 'base';
  if ($('#sheet').classList.contains('on')) {
    closeSheet();
    // シートは履歴を積んでいないので、いま消えた分を積み直す
    if (pageStack.length) history.pushState({ hm: 'page', id: pageStack[pageStack.length - 1] }, '');
    else if (atBase) history.pushState({ hm: 'app' }, '');
    return;
  }
  if (pageStack.length) { closePage(undefined, true); if (atBase) history.pushState({ hm: 'app' }, ''); return; }
  if (atBase) history.pushState({ hm: 'app' }, '');   // これ以上戻らない（アプリに留まる）
});
(() => {
  let x0 = null, dx = 0, pg = null;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0]; pg = e.target.closest('.page.on');
    if (pg && standalone && t.clientX < 28) { x0 = t.clientX; dx = 0; pg.style.transition = 'none'; } else x0 = null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (x0 == null) return; dx = Math.max(0, e.touches[0].clientX - x0);
    pg.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  document.addEventListener('touchcancel', () => { if (x0 == null) return; pg.style.transition = ''; pg.style.transform = ''; x0 = null; });
  document.addEventListener('touchend', () => {
    if (x0 == null) return; pg.style.transition = '';
    if (dx > 90) closePage(pg.id); else pg.style.transform = '';
    x0 = null;
  });
})();

// ═══════════════════════ TABS ═══════════════════════
function setTab(t) {
  if (S.tab === t) { $('#t-' + t).scrollTo({ top: 0, behavior: 'smooth' }); return; }
  S.tab = t; buzz(5); document.body.dataset.tab = t;
  try { sessionStorage.setItem('hm_tab', t); } catch { /* */ }
  $$('.tab').forEach(x => x.classList.toggle('on', x.id === 't-' + t));
  $$('.nb').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  if (t === 'dm') { refreshThreads(); loadNotifs(); }
  if (t === 'me') refreshMe();
  render();
}

function render() {
  if (S.tab === 'home') renderHome();
  else if (S.tab === 'listen') renderListen();
  else if (S.tab === 'dm') renderInbox();
  else if (S.tab === 'me') renderMe();
}

function badges() {
  const un = S.threads.reduce((a, t) => a + (+t.unread || 0), 0);
  const nn = V8.notifs.filter(x => !x.read_at && x.kind !== 'care').length;
  const b = $('#dm-badge'); const n = un + nn; b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hide', !n);
  const q = listenQueue().filter(p => isToday(p.created_at) && !p.i_listened && !V8.listened.has(p.id)).length;
  const l = $('#ls-badge'); if (l) { l.textContent = q > 9 ? '9+' : q; l.classList.toggle('hide', !q || S.tab === 'listen'); }
  if ('setAppBadge' in navigator) { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch?.(() => {}); }
}

// ═══════════════════════ HOME ═══════════════════════
function momentActive() {
  if (!S.moment?.at) return 0;
  const left = new Date(S.moment.at).getTime() + 600000 - Date.now();
  return left > 0 ? left : 0;
}
const fmtLeft = ms => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}`;

function postCard(p) {
  const locked = false;   // v9：見るための投稿義務はなし（代わりに「聴くと開く」）
  const a = p.author || {};
  const mo = moodOf(p.mood);
  const needListen = !p.mine && p.has_comment && p.comment == null;
  const rx = REACTS.map(e => {
    const n = p.mine ? (p.reactions?.[e] || 0) : 0; const on = p.my_reaction === e;   // ⑤ 数字は本人にだけ
    return `<button class="rx ${on ? 'on' : ''}" data-act="react" data-id="${p.id}" data-e="${e}">${rxInner(e, n)}</button>`;
  }).join('') + rxOthers(p);
  const [me, ml] = splitMood(p.mood);
  return `<article class="post ${locked ? 'locked' : ''}" data-post="${p.id}">
    <div class="post-hd">${ava(a, 38)}<div class="who"><div class="nm ellip">${esc(p.mine ? 'あなた' : a.name)}</div>
      <div class="tm">${rel(p.created_at)}${p.is_public && p.mine ? '<span>· 🌍 みんなにも</span>' : ''}</div></div>
      <button class="icon-btn" style="width:32px;height:32px;background:none;border:none" data-act="post-menu" data-id="${p.id}" aria-label="メニュー">${I.more}</button></div>
    <div class="song tap" data-act="open-post" data-id="${p.id}">${art(p)}<div class="meta"><div class="ti ellip">${esc(p.title)}</div><div class="ar ellip">${esc(p.artist)}</div></div>${needListen ? `<span class="listen-ring" data-ring="${p.id}" style="--mc:${mo.c}">${playBtn(p)}</span>` : playBtn(p)}</div>
    ${p.comment ? `<div class="cm">${esc(p.comment)}</div>` : needListen ? `<div class="cm-lock" data-lock="${p.id}">${I.headphones}<span>15秒聴くと、ひとことが開きます</span></div>` : ''}
    <div class="mood">${moodChip(p.mood)}</div>
    ${locked ? '' : `<div class="reacts">${rx}</div>`}
    ${locked ? '' : p.mine ? `<div class="post-foot">${p.listened ? `<span>${p.listened}人が聴いてくれた</span>` : '<span class="faint">まだ誰も聴いていません</span>'}<button data-act="same-mood" data-m="${esc(p.mood)}">同じ色の人</button></div>`
      : (p.author?.id && S.friends.some(f => f.id === p.author.id)) ? `<div class="post-foot"><span class="faint">${p.i_listened ? '聴いた' : ''}</span><button class="gift-btn" style="--mc:${mo.c}" data-act="gift" data-id="${esc(p.author.id)}" data-post="${p.id}">${I.gift} 曲を贈る</button></div>` : ''}
    ${locked ? `<div class="lockmsg"><div style="font-size:26px">🔒</div><b>今日の1曲をシェアすると見られます</b><button class="btn p sm" data-act="compose">シェアする</button></div>` : ''}
  </article>`;
}
function splitMood(m = '') { const i = m.indexOf(' '); return i > 0 ? [m.slice(0, i), m.slice(i + 1)] : [m, '']; }

function skeletonPosts(n = 2) {
  return Array.from({ length: n }, () => `<div class="post"><div class="row" style="margin-bottom:12px"><div class="sk" style="width:38px;height:38px;border-radius:50%"></div><div style="flex:1"><div class="sk" style="width:40%;height:12px;margin-bottom:6px"></div><div class="sk" style="width:25%;height:10px"></div></div></div><div class="sk" style="height:80px;border-radius:16px"></div></div>`).join('');
}

function greet() { const h = new Date().getHours(); return h < 4 ? 'こんばんは' : h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは'; }
// 今日のフレンドの投稿（1人1曲・最新）
function todayByFriend() {
  const m = new Map();
  for (const p of S.feed) { if (p.mine || !p.author?.id || !isToday(p.created_at)) continue; if (!m.has(p.author.id)) m.set(p.author.id, p); }
  return m;
}
function friendRow(f, p) {
  const mo = moodOf(p.mood); const heard = p.i_listened || V8.listened.has(p.id);
  return `<button class="fr ${heard ? 'heard' : ''}" style="--mc:${mo.c}" data-act="listen" data-id="${p.id}">
    <span class="fr-av" data-act="profile" data-id="${esc(f.id)}">${ava(f, 46)}</span>
    <span class="fr-tx"><b class="ellip">${esc(f.name)}</b><small class="ellip">${esc(p.title)}<i>·</i>${esc(p.artist)}</small></span>
    <span class="fr-r">${heard ? `<span class="fr-heard">${I.check} 聴いた</span>` : `<span class="fr-new">${I.headphones} きく</span>`}</span></button>`;
}
// 見本の虹：自分の色＋ほかの3色（重ならないように選ぶ）
function sampleRainbow(mine) {
  const me = mine ? moodOf(mine.mood).e : '😌';
  const others = ['😊', '😢', '🥰', '🔥', '😴'].filter(e => e !== me).slice(0, 3);
  return { total: 4, moods: [me, ...others].map(e => ({ e, n: 1 })) };
}
function myTodayCard(p) {
  const mo = moodOf(p.mood);
  return `<button class="mytoday" style="--mc:${mo.c}" data-act="open-post" data-id="${p.id}">${art(p, 52)}
    <span class="mt-tx"><small>今日のあなたの1曲</small><b class="ellip">${esc(p.title)}</b><span class="ellip">${esc(p.artist)}</span></span>
    <span class="mt-r"><span class="mchip sm" style="--mc:${mo.c}"><i></i>${esc(mo.label)}</span><small>${p.listened ? `${p.listened}人が聴いた` : 'まだ誰も聴いていません'}</small></span></button>`;
}
function renderHome() {
  const el = $('#t-home');
  const tp = todayByFriend();
  const mine = postedToday()[0];
  const posted = S.friends.filter(f => tp.has(f.id))
    .sort((a, b) => (tp.get(a.id).i_listened ? 1 : 0) - (tp.get(b.id).i_listened ? 1 : 0));
  const waiting = S.friends.filter(f => !tp.has(f.id));
  const unheard = posted.filter(f => !tp.get(f.id).i_listened && !V8.listened.has(tp.get(f.id).id)).length;
  let list;
  if (!S.loaded.feed) list = `<div class="fr-sk">${'<div class="sk" style="height:62px;border-radius:18px"></div>'.repeat(3)}</div>`;
  else if (!S.friends.length) list = `<div class="invite ${mine ? 'sm' : ''}">
      <div class="inv-sample">${miniRainbow(sampleRainbow(mine), 120)}<span>見本</span></div>
      <b>4人で色をたすと、こんな虹に</b><p>仲のいい人を招待すると、その人の色が重なって、毎日ちがう虹ができていきます。</p>
      <div class="inv-btns"><button class="btn p" data-act="share-invite">${I.share} 招待リンクを送る</button><button class="btn g" data-act="add-friend">コードで追加</button></div></div>`;
  else list = `
    ${posted.length ? `<div class="sec2"><span>今日とどいた曲</span>${unheard ? `<button class="sec2-go" data-act="tab" data-tab="listen">まとめてきく ${unheard}</button>` : ''}</div>
      <div class="frs">${posted.map(f => friendRow(f, tp.get(f.id))).join('')}</div>` : ''}
    ${waiting.length ? `<div class="sec2"><span>まだ空のまま</span></div><div class="frs wait">${waiting.map(f => `<div class="fr wait"><span data-act="profile" data-id="${esc(f.id)}">${ava(f, 40)}</span><span class="fr-tx" data-act="profile" data-id="${esc(f.id)}"><b class="ellip">${esc(f.name)}</b><small>${f.last_post ? `最後の色 · ${rel(f.last_post.created_at)}` : 'まだ色がありません'}</small></span><button class="fr-gift" data-act="gift" data-id="${esc(f.id)}" aria-label="${esc(f.name)}に曲を贈る">${I.gift}</button></div>`).join('')}</div>` : ''}`;
  el.innerHTML = `
    <div class="hd"><div class="logo"><img src="/logo-mark.png" alt=""><span>hearme</span></div>
      <button class="icon-btn" data-act="add-friend" aria-label="フレンド追加">${I.userplus}</button></div>
    <div class="ptr" id="ptr"></div>
    ${showInstallCard() ? `<div class="inst"><img src="/icon-192.png" alt=""><span>ホーム画面に追加すると、通知が届きます</span><button class="btn p sm" data-act="install-app">追加</button><button class="inst-x" data-act="install-dismiss" aria-label="閉じる">✕</button></div>` : ''}
    ${LIVE ? '' : `<div class="demo">デモモード：データはこの端末だけに保存されます。ゆーき・みおはお試し用のフレンドです</div>`}
    <div class="hello">${greet()}、${esc(S.profile?.name || '')}</div>
    ${rainbowHTML()}
    ${mine ? myTodayCard(mine) : `<button class="addme" data-act="compose"><span class="addme-dots">${RAINBOW_ORDER.map(e => `<i style="background:${MOOD_META[e].c}"></i>`).join('')}</span><span class="addme-tx"><b>今日のあなたの色は？</b><small>気分をえらんで、1曲たす</small></span>${I.plus.replace('<svg', '<svg width="18" height="18"')}</button>`}
    ${bannersHTML()}
    ${list}
    <div style="height:100px"></div>`;
}

// ═══════════════════════ LISTEN（きく） ═══════════════════════
function listenQueue() {
  const fr = S.feed.filter(p => !p.mine && p.author?.id && Date.now() - new Date(p.created_at).getTime() < 3 * 86400000);
  const heard = p => p.i_listened || V8.listened.has(p.id);
  return [...fr.filter(p => !heard(p)), ...fr.filter(heard)];
}
function slideHTML(p) {
  const a = p.author || {}; const mo = moodOf(p.mood);
  const needListen = p.has_comment && p.comment == null;
  const isFriend = S.friends.some(f => f.id === a.id);
  return `<section class="slide" data-post="${p.id}" style="--mc:${mo.c}">
    <div class="sl-bg"></div>
    <div class="sl-top"><button class="sl-who" data-act="profile" data-id="${esc(a.id || '')}">${ava(a, 32)}<b class="ellip">${esc(a.name)}</b></button><span>${rel(p.created_at)}</span>
      <button class="icon-btn sl-more" data-act="post-menu" data-id="${p.id}" aria-label="メニュー">${I.more}</button></div>
    <div class="sl-art">${art(p)}
      <span class="listen-ring xl ${needListen ? '' : 'done'}" data-ring="${p.id}" style="--mc:${mo.c}">${playBtn(p) || ''}</span></div>
    <div class="sl-meta"><div class="ti ellip">${esc(p.title)}</div><div class="ar ellip">${esc(p.artist)}</div></div>
    <div class="sl-mood">${moodChip(p.mood)}</div>
    <div class="sl-cm">${p.comment ? `<p class="cm-open">${esc(p.comment)}</p>` : needListen ? `<div class="cm-lock" data-lock="${p.id}">${I.headphones}<span>${p.preview_url ? '15秒聴くと、ひとことが開きます' : 'ひとことがあります'}</span></div>` : ''}</div>
    <div class="sl-act">
      <div class="reacts">${REACTS.map(e => `<button class="rx ${p.my_reaction === e ? 'on' : ''}" data-act="react" data-id="${p.id}" data-e="${e}">${rxInner(e, 0)}</button>`).join('')}</div>
      ${isFriend ? `<div class="sl-btns"><button class="gift-btn" style="--mc:${mo.c}" data-act="gift" data-id="${esc(a.id)}" data-post="${p.id}">${I.gift} 曲を贈る</button><button class="sl-reply" data-act="chat" data-id="${esc(a.id)}">${I.chat} ことばを送る</button></div>` : ''}
    </div>
  </section>`;
}
function renderListen() {
  const el = $('#t-listen'); const q = listenQueue();
  const end = `<section class="slide end"><div class="sl-end">
      ${q.length ? `<b>今日の空は、ここまで</b><p>聴いてもらえると、その人にちゃんと届きます。</p>` : `<b>まだ、とどいた曲がありません</b><p>フレンドが色をたすと、ここで1曲ずつ聴けます。</p>`}
      ${postedToday().length ? `<button class="btn g" data-act="tab" data-tab="home">虹を見る</button>` : `<button class="btn p" data-act="compose">あなたの色をたす</button>`}
      ${S.friends.length ? '' : `<button class="btn g" style="margin-top:8px" data-act="share-invite">${I.share} 招待リンクを送る</button>`}</div></section>`;
  el.innerHTML = q.map(slideHTML).join('') + end;
  watchSlides();
}
// スクロールして次の曲に来たら、再生中ならそのまま次を流す
let slideIO = null;
function watchSlides() {
  slideIO?.disconnect();
  slideIO = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting || e.intersectionRatio < .65) continue;
      const p = S.posts.get(e.target.dataset.post); const st = music.player.state();
      if (p && st.playing && st.song && !music.player.isCurrent(p) && listenQueue().some(x => music.player.isCurrent(x)) && p.preview_url) music.player.toggle(p);
    }
  }, { root: $('#t-listen'), threshold: [.65] });
  $$('#t-listen .slide[data-post]').forEach(s => slideIO.observe(s));
}
function goListen(id) {
  setTab('listen');
  requestAnimationFrame(() => { const s = $(`#t-listen .slide[data-post="${id}"]`); if (s) $('#t-listen').scrollTo({ top: s.offsetTop, behavior: 'instant' }); });
}

// ═══════════════════════ INBOX（とどいた） ═══════════════════════
const NOTIF_IC = {
  gift: I.gift, listened: I.headphones, sync: I.spark, sync_mood: I.spark,
  rain: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 15a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 18.5 8 3.5 3.5 0 0 1 18 15z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/></svg>',
};
const NOTIF_C = { gift: '#F29BB8', listened: '#8FD1B5', sync: '#F5C76B', sync_mood: '#F5C76B', rain: '#6FA0E6' };
const stripEmoji = t => String(t || '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');
function renderInbox() {
  const el = $('#t-dm'); const tab = S.inbox || 'n';
  const notifs = V8.notifs.filter(n => n.kind !== 'care');
  let body;
  if (tab === 'n') body = notifs.length ? notifs.map(n => `<button class="nt ${n.read_at ? '' : 'un'}" style="--mc:${NOTIF_C[n.kind] || '#B8C4D6'}" data-act="notif-go" data-url="${esc(n.url)}">
        <span class="nt-ic">${NOTIF_IC[n.kind] || I.bell.replace('<svg', '<svg width="16" height="16"')}</span>
        <span class="nt-tx"><b>${esc(stripEmoji(n.title))}</b>${n.body ? `<small class="ellip">${esc(n.body)}</small>` : ''}</span><span class="nt-tm">${rel(n.created_at)}</span></button>`).join('')
      : `<div class="empty2"><b>まだ何もとどいていません</b><p>曲を贈ってもらったり、聴いてもらえたら、ここに届きます。</p></div>`;
  else if (!S.loaded.threads) body = Array.from({ length: 4 }, () => `<div class="th"><div class="sk" style="width:50px;height:50px;border-radius:50%"></div><div style="flex:1"><div class="sk" style="width:35%;height:13px;margin-bottom:7px"></div><div class="sk" style="width:60%;height:11px"></div></div></div>`).join('');
  else if (!S.threads.length) body = `<div class="empty2"><b>メッセージはフレンドとだけ</b><p>招待コードを交換した相手とだけ話せます。知らない人からは届きません。</p></div>`;
  else body = S.threads.map(t => {
    const l = t.last; const un = +t.unread || 0;
    const st = l?.song && typeof l.song === 'object' ? l.song : null;
    const pv = !l ? 'ことばを送ってみよう' : (l.mine ? 'あなた: ' : '') + (st?.reaction ? `「${st.title}」にリアクション` : l.song && !l.body ? (st?.title ? `曲：${st.title}` : '曲を送りました') : l.body);
    return `<div class="th" data-act="chat" data-id="${esc(t.peer.id)}">${ava(t.peer, 50)}<div class="info"><div class="nm ellip">${esc(t.peer.name)}</div><div class="pv ellip ${un ? 'un' : ''}">${esc(pv)}</div></div><div class="rt">${l ? `<div class="tm">${rel(l.created_at)}</div>` : ''}${un ? `<div class="cnt">${un}</div>` : ''}</div></div>`;
  }).join('');
  const nUn = notifs.filter(n => !n.read_at).length, mUn = S.threads.reduce((a, t) => a + (+t.unread || 0), 0);
  el.innerHTML = `<div class="hd"><h1>とどいた</h1><button class="icon-btn" data-act="gifts" aria-label="贈りもの">${I.gift.replace('width="15" height="15"', 'width="20" height="20"')}</button></div>
    <div style="padding:0 16px 10px"><div class="seg"><button class="${tab === 'n' ? 'on' : ''}" data-act="inbox-tab" data-k="n">おしらせ${nUn ? ` <i class="dot"></i>` : ''}</button><button class="${tab === 'm' ? 'on' : ''}" data-act="inbox-tab" data-k="m">メッセージ${mUn ? ` <i class="dot"></i>` : ''}</button></div></div>
    <div class="inbox">${body}</div><div style="height:100px"></div>`;
  if (tab === 'n' && nUn && S.tab === 'dm') api.readNotifications().then(() => { V8.notifs.forEach(n => n.read_at ||= new Date().toISOString()); badges(); }).catch(() => {});
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
const C = { song: null, mood: null, comment: '', pub: false, results: [], q: '', ctrl: null, ai: { q: '', loading: false, songs: [], err: '', left: null } };
function openComposer(prefill) {
  if (!leftToday()) { toast('今日はもう3回たしました。また明日'); return; }
  Object.assign(C, { song: prefill || null, mood: null, comment: '', pub: false, results: [], q: '', mx: null, my: null });
  C.ai = { q: '', loading: false, songs: [], err: '', left: C.ai?.left ?? null };
  openSheet(`<div id="cmp"></div>`, { full: true });
  renderComposer();
}
function tintComposer() {
  const g = $('#cmp-glow'); if (g) g.style.backgroundColor = C.mood ? moodOf(C.mood).c : 'transparent';
}
let sT;
function searchDebounced() {
  clearTimeout(sT);
  sT = setTimeout(async () => {
    const q = C.q.trim(); if (!q) { C.results = []; const r = $('#cmp-res'); if (r) r.innerHTML = chartPicks(); return; }
    C.ctrl?.abort(); C.ctrl = new AbortController();
    $('#cmp-spin') && ($('#cmp-spin').className = 'spin');
    try { C.results = await music.search(q, { signal: C.ctrl.signal }); refreshResults(); if (!C.results.length) $('#cmp-res').innerHTML = `<div class="faint" style="padding:18px;font-size:13px;text-align:center">「${esc(q)}」は見つかりませんでした</div>`; }
    catch (e) { if (e.name !== 'AbortError' && !C.ctrl.signal.aborted) { toast('検索できませんでした。電波を確認して、もう一度ためしてね'); console.warn('search', e); } }
    $('#cmp-spin') && ($('#cmp-spin').className = '');
  }, 320);
}
function refreshResults() {
  const r = $('#cmp-res'); if (!r) return;
  r.innerHTML = C.results.map((s, i) => `<div class="res" data-act="pick" data-i="${i}">${art(s)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(s.artist)}</div></div>${playBtn(s, 'dim')}</div>`).join('');
}
async function submitPost() {
  if (!C.song || !C.mood) return;
  const b = $('#cmp-go'); b.disabled = true; b.textContent = 'たしています…';
  try {
    await api.createPost({
      track_id: C.song.track_id || null, title: C.song.title.slice(0, 200), artist: (C.song.artist || '').slice(0, 200),
      artwork: ART_RE.test(C.song.artwork || '') ? C.song.artwork : null,
      preview_url: PREVIEW_RE.test(C.song.preview_url || '') ? C.song.preview_url : null,
      track_url: TRACK_RE.test(C.song.track_url || '') ? C.song.track_url : null,
      mood: C.mood, comment: C.comment.trim().slice(0, 60), is_public: false,
      ...(C.mx != null ? { mood_x: C.mx, mood_y: C.my } : {}),
    });
    const postedMood = C.mood;
    buzz([10, 40, 10]); closeSheet();
    S.justAdded = moodOf(postedMood).e;
    $('#t-home').scrollTop = 0; if (S.tab !== 'home') setTab('home');
    await loadFeeds();
    toast('あなたの色が、今日の虹に加わりました', 3200);
    setTimeout(() => { S.justAdded = null; }, 2500);
  } catch (e) { toast(errText(e)); b.disabled = false; b.textContent = 'この色を、今日の虹にたす'; }
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
      <div class="reacts">${REACTS.map(e => `<button class="rx ${p.my_reaction === e ? 'on' : ''}" data-act="react" data-id="${p.id}" data-e="${e}">${rxInner(e, p.mine ? p.reactions?.[e] : 0)}</button>`).join('')}${rxOthers(p)}</div>
    </div>
    ${canDM ? `<div style="padding:0 20px 12px"><div class="composer" style="border:none;padding:0;background:none"><textarea id="reply" rows="1" placeholder="${esc(a.name)}に返信…" maxlength="1000"></textarea><button class="send" data-act="reply" data-id="${p.id}" aria-label="送信">${I.send}</button></div><div class="faint" style="font-size:11.5px;margin-top:6px;padding-left:4px">この曲をつけてDMで送ります</div></div>` : ''}
    <div style="padding:4px 20px 24px;display:flex;gap:8px;flex-wrap:wrap">${p.mine ? `<button class="btn g sm" data-act="story-post" data-id="${p.id}">📸 ストーリーに</button><button class="btn g sm" data-act="same-mood" data-m="${esc(p.mood)}">同じ気持ちの人</button><button class="btn d sm" data-act="del-post" data-id="${p.id}">削除</button>`
      : `${canDM ? `<button class="btn g sm" data-act="gift" data-id="${esc(a.id)}" data-post="${p.id}">🎁 曲を贈る</button>` : ''}<button class="btn g sm" data-act="share-song" data-id="${p.id}">この曲で投稿</button><button class="btn g sm" data-act="post-menu" data-id="${p.id}">…</button>`}</div>`);
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
    ${S.loaded.chart && !S.chart.length ? `<div class="empty" style="padding:28px 16px">ランキングを読み込めませんでした<div style="margin-top:12px"><button class="btn g sm" data-act="retry-chart">もう一度</button></div></div>` : S.loaded.chart ? `<div class="hero-chart">${top.map((s, i) => `<div class="hc"><div class="art" style="width:150px;height:150px">${safeImg(s.artwork) ? `<img src="${esc(s.artwork)}" alt="" loading="lazy">` : I.note}${playBtn(s)}<div style="position:absolute;left:10px;top:8px;font-family:var(--disp);font-weight:800;font-size:22px;text-shadow:0 2px 10px rgba(0,0,0,.6)">${i + 1}</div></div><div class="ti ellip">${esc(s.title)}</div><div class="ar ellip">${esc(s.artist)}</div><button class="btn g sm" style="margin-top:8px;width:100%" data-act="share-this" data-song="${songData(s)}">この曲でシェア</button></div>`).join('')}</div>
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
function renderDM() { renderInbox(); }

// ═══════════════════════ CHAT ═══════════════════════
async function openChat(peerId) {
  let peer = S.friends.find(f => f.id === peerId) || S.threads.find(t => t.peer.id === peerId)?.peer;
  if (!peer) { await loadFriends(); peer = S.friends.find(f => f.id === peerId); }
  if (!peer) { toast('フレンドではない相手とはDMできません'); return; }
  S.chat = { peer, msgs: [], typingUntil: 0, typing: null, loadingOld: false, done: false };
  const pg = $('#pg-chat');
  pg.innerHTML = `<div class="ig-hd"><button class="back" data-act="close-page" aria-label="戻る">${I.back}</button>
      <button class="ig-who" data-act="profile" data-id="${esc(peer.id)}">${ava(peer, 34)}<span><b class="ellip">${esc(peer.name)}</b><small id="chat-sub">${esc(peer.bio || 'フレンド')}</small></span></button>
      <button class="icon-btn ig-gift" data-act="gift" data-id="${esc(peer.id)}" aria-label="曲を贈る">${I.gift.replace('width="15" height="15"', 'width="21" height="21"')}</button></div>
    <div class="chat ig" id="chat"><div style="margin:auto;padding:30px" class="faint"><div class="spin" style="margin:0 auto"></div></div></div>
    <div class="ig-bar"><div class="ig-pill">
      <button class="ig-song" data-act="chat-song" aria-label="曲を送る"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg></button>
      <textarea id="chat-in" rows="1" placeholder="メッセージを入力…" maxlength="1000" enterkeyhint="send" autocomplete="off"></textarea>
      <button class="ig-send" data-act="chat-send" id="chat-send" disabled>送信</button></div></div>`;
  openPage('pg-chat'); document.body.classList.add('chat-open');
  const inp = $('#chat-in');
  let lastPing = 0;
  inp.oninput = () => {
    inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
    const has = !!inp.value.trim(); $('#chat-send').disabled = !has; $('.ig-pill')?.classList.toggle('typing', has);
    if (Date.now() - lastPing > 2500 && inp.value) { lastPing = Date.now(); S.chat?.typing?.ping(); }
  };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isIOS) { e.preventDefault(); chatSend(); } };
  S.chat.typing = api.joinTyping(peer.id, () => { if (!S.chat) return; S.chat.typingUntil = Date.now() + 4000; drawTyping(); setTimeout(drawTyping, 4100); });
  $('#chat').onscroll = () => { if ($('#chat').scrollTop < 60) loadOlder(); };
  const me = S.chat;
  try {
    const msgs = await api.messages(peer.id);
    if (S.chat !== me) return;   // 読み込み中に別のDMへ移ったら捨てる
    S.chat.msgs = msgs;
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
    if (S.chat !== c) return;
    c.done = older.length < 50; c.msgs = older.concat(c.msgs); drawChat();
    box.scrollTop = box.scrollHeight - h0;
  } catch { /* */ }
  c.loadingOld = false;
}
function msgHTML(m, me, pos = 'single', showAva = false) {
  const mine = m.sender === me;
  const s = m.song;
  if (s?.reaction) return `<div class="rxmsg">${mine ? 'あなたが' : esc(S.chat.peer.name) + 'が'}「${esc(s.title)}」に${esc(RX_META[s.reaction]?.l ? `「${RX_META[s.reaction].l}」` : 'リアクション')}</div>`;
  const card = s ? `<div class="mcard">${art(s, 0, playBtn(s))}<div class="mi"><div class="ti ellip">${esc(s.title)}</div><div class="ar ellip">${esc(s.artist)}</div>${s.reply_to ? '<div class="faint" style="font-size:11px;margin-top:3px">投稿への返信</div>' : ''}</div></div>${m.body ? `<div class="bub">${esc(m.body)}</div>` : ''}` : `<div class="bub">${esc(m.body)}</div>`;
  return `<div class="msg ${mine ? 'me' : 'them'} g-${pos} ${m._pending ? 'pending' : ''} ${m._failed ? 'failed' : ''}" data-mid="${m.id}">
    ${mine ? '' : `<span class="m-ava">${showAva ? ava(S.chat.peer, 28) : ''}</span>`}<div class="m-col">${card}${m._failed ? '<div class="st">送信できませんでした・タップで再送</div>' : ''}</div></div>`;
}
function drawChat(toBottom) {
  const c = S.chat; if (!c) return; const box = $('#chat'); const me = api.uid;
  const near = toBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (!c.msgs.length) { box.innerHTML = `<div class="ig-empty">${ava(c.peer, 84)}<b>${esc(c.peer.name)}</b><small>hearme のフレンド</small><p>ことばや曲を送ってみよう</p></div>`; return; }
  let html = '', lastT = 0;
  const lastMine = [...c.msgs].reverse().find(m => m.sender === me && !m.song?.reaction);
  const ms = c.msgs;
  ms.forEach((m, i) => {
    const t = new Date(m.created_at).getTime();
    // 15分以上あいたら時刻を真ん中に（インスタと同じ）
    if (!lastT || t - lastT > 15 * 60000) html += `<div class="day">${isToday(m.created_at) ? hm(m.created_at) : `${dayLabel(m.created_at)} ${hm(m.created_at)}`}</div>`;
    const prev = ms[i - 1], next = ms[i + 1];
    const tp = prev && prev.sender === m.sender && !prev.song?.reaction && t - new Date(prev.created_at).getTime() < 15 * 60000;
    const tn = next && next.sender === m.sender && !next.song?.reaction && new Date(next.created_at).getTime() - t < 15 * 60000;
    const pos = tp && tn ? 'mid' : tp ? 'last' : tn ? 'first' : 'single';
    html += msgHTML(m, me, pos, !tn);
    if (lastMine && m.id === lastMine.id && m.sender === me) html += `<div class="seen">${m._pending ? '送信中…' : m.read_at ? `既読 ${hm(m.read_at)}` : '送信済み'}</div>`;
    lastT = t;
  });
  html += `<div id="typing-slot"></div>`;
  box.innerHTML = html; drawTyping();
  if (near) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}
function drawTyping() {
  const c = S.chat; if (!c) return; const on = Date.now() < c.typingUntil;
  const slot = $('#typing-slot'); if (slot) slot.innerHTML = on ? `<div class="msg them g-single"><span class="m-ava">${ava(c.peer, 28)}</span><div class="typing"><i></i><i></i><i></i></div></div>` : '';
  const sub = $('#chat-sub'); if (sub) sub.textContent = on ? '入力中…' : (c.peer.bio || 'フレンド');
  if (on) { const b = $('#chat'); if (b.scrollHeight - b.scrollTop - b.clientHeight < 160) b.scrollTop = b.scrollHeight; }
}
async function chatSend(song) {
  const c = S.chat; if (!c) return;
  const inp = $('#chat-in'); const body = song ? '' : inp.value.trim();
  if (!body && !song) return;
  if (!song) { inp.value = ''; inp.style.height = 'auto'; $('#chat-send').disabled = true; $('.ig-pill')?.classList.remove('typing'); inp.focus(); }
  const tmp = { id: 'tmp' + Date.now(), sender: api.uid, receiver: c.peer.id, body, song: song || null, created_at: new Date().toISOString(), _pending: true };
  c.msgs.push(tmp); drawChat(true); buzz(6);
  try {
    const m = await api.send(c.peer.id, body, song);
    const i = c.msgs.indexOf(tmp); if (i >= 0) c.msgs[i] = m;
  } catch (e) { tmp._pending = false; tmp._failed = true; toast(errText(e)); }
  drawChat(true);
}
function openSongPicker(onPick, title = '曲を送る') {
  const P = { q: '', res: [] };
  openSheet(`<div style="padding:0 0 10px"><div class="disp" style="text-align:center;font-size:17px;margin-bottom:12px">${esc(title)}</div><div class="srch">${I.search}<input id="sp-q" placeholder="曲名・アーティスト名" enterkeyhint="search" autocomplete="off"></div><div id="sp-res" style="padding-top:6px;min-height:40vh"></div></div>`, { full: true });
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
function monthColors() {   // v9.1：連続日数のかわりに「今月つかった色」（義務感のない数字）
  const d = new Date(), ym = d.getFullYear() * 12 + d.getMonth();
  const es = [...new Set(S.mine.filter(p => { const t = new Date(p.created_at); return t.getFullYear() * 12 + t.getMonth() === ym; }).map(p => moodOf(p.mood).e || splitMood(p.mood)[0]))];
  return RAINBOW_ORDER.filter(e => es.includes(e));
}
function streak() {
  const days = new Set(S.mine.map(p => dayKey(p.created_at)));
  let n = 0; const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
// ═══════════════════════ PROFILE（じぶん・フレンドのページ） ═══════════════════════
function miniRainbow(data, w = 120) {
  const moods = RAINBOW_ORDER.map(e => (data?.moods || []).find(m => m.e === e)).filter(Boolean);
  const total = Math.max(1, data?.total || 1);
  const R = w / 2 - 2, cy = R + 2, TH = Math.min(R * .62, w * .05 + w * .06 * (total - 1));
  let r = R, paths = '';
  moods.forEach(m => { const t = Math.max(w * .025, TH * m.n / total); const rr = r - t / 2; paths += `<path d="M${(w / 2 - rr).toFixed(1)} ${cy}A${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(w / 2 + rr).toFixed(1)} ${cy}" stroke="${MOOD_META[m.e]?.c || '#ccc'}" stroke-width="${t.toFixed(1)}" fill="none"/>`; r -= t; });
  return `<svg viewBox="0 0 ${w} ${cy + 1}" width="100%" aria-hidden="true">${paths}</svg>`;
}
const mdLabel = d => { const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()}`; };
function profileHTML(d, self) {
  const posts = d.posts || [];
  const last = posts[0]; const mc = last && isToday(last.created_at) ? moodOf(last.mood).c : 'var(--ln3)';
  const fav = d.fav_songs || [];
  const rbs = d.rainbows || [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const d2 = new Date(); const tk = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`;
  const savedToday = rbs.some(r => String(r.day).slice(0, 10) === tk || String(r.day).slice(0, 10) === todayKey);
  const cal = [];
  for (let i = 13; i >= 0; i--) {
    const dd = new Date(); dd.setDate(dd.getDate() - i);
    const p = posts.find(x => dayKey(x.created_at) === dayKey(dd));
    cal.push(`<span class="cd ${i === 0 ? 'today' : ''}" ${p ? `style="--mc:${moodOf(p.mood).c}"` : ''}><i></i><small>${dd.getDate()}</small></span>`);
  }
  const did = esc(d.id);
  return `<div class="pf">
    <div class="pf-top"><div class="pf-ava" style="--mc:${mc}">${ava(d, 86)}</div>
      <div class="pf-stats"><button data-act="pf-jump" data-to="pf-col"><b>${d.days ?? 0}</b><small>色の日</small></button><button data-act="pf-jump" data-to="pf-rb"><b>${rbs.length}</b><small>虹</small></button>${self ? `<button data-act="friends-list"><b>${d.friends ?? 0}</b><small>フレンド</small></button>` : `<div><b>${d.friends ?? 0}</b><small>フレンド</small></div>`}</div></div>
    <div class="pf-name">${esc(d.name || '')}</div>${d.bio ? `<div class="pf-bio">${esc(d.bio)}</div>` : ''}
    ${!self && d.since ? `<div class="pf-since">${mdLabel(d.since)} からフレンド</div>` : ''}
    <div class="pf-btns">${self
      ? `<button class="pf-btn" data-act="settings">プロフィールを編集</button><button class="pf-btn" data-act="add-friend">コード・招待</button>`
      : `<button class="pf-btn p" data-act="chat" data-id="${did}">メッセージ</button><button class="pf-btn" data-act="gift" data-id="${did}">曲を贈る</button><button class="pf-btn ic" data-act="friend-menu" data-id="${did}" aria-label="メニュー">${I.more}</button>`}</div>

    <div class="pf-sec"><b>お気に入りの曲</b>${self && fav.length < 5 ? `<button data-act="fav-add">${I.plus.replace('<svg', '<svg width="14" height="14"')} 追加</button>` : ''}</div>
    ${fav.length ? `<div class="favs">${fav.map((s, i) => `<div class="fav">${art(s, 0, playBtn(s))}<div class="fav-ti ellip">${esc(s.title)}</div><div class="fav-ar ellip">${esc(s.artist)}</div>${self ? `<button class="fav-x" data-act="fav-del" data-i="${i}" aria-label="外す">${I.x.replace('<svg', '<svg width="11" height="11"')}</button>` : ''}</div>`).join('')}</div>`
      : `<div class="pf-empty">${self ? `<button data-act="fav-add">好きな曲を5曲まで飾れます</button>` : 'まだありません'}</div>`}

    <div class="pf-sec" data-anchor="pf-rb"><b>虹コレクション</b>${self && !savedToday && S.rainbow?.moods?.length ? `<button data-act="rb-save">${I.plus.replace('<svg', '<svg width="14" height="14"')} 今日の虹を残す</button>` : ''}</div>
    ${rbs.length ? `<div class="rbs">${rbs.map(r => `<button class="rbc" data-act="rb-open" data-id="${esc(r.id)}" data-u="${did}">${miniRainbow(r.data, 120)}<span>${mdLabel(r.day)}</span><small>${r.data?.total || 1}人</small></button>`).join('')}</div>`
      : `<div class="pf-empty">${self ? '気に入った日の虹を、ここに残しておけます' : 'まだありません'}</div>`}

    <div class="pf-sec" data-anchor="pf-col"><b>最近の色</b></div>
    <div class="card pf-cal"><div class="cal2">${cal.join('')}</div></div>

    <div class="pf-sec"><b>${self ? 'あなたがたした曲' : '最近の曲'}</b></div>
    ${posts.length ? `<div class="card list">${posts.slice(0, 30).map(x => { const mo = moodOf(x.mood); return `<div class="li tap" data-act="open-post" data-id="${x.id}">${art(x, 44)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(x.title)}</div><div class="ellip faint" style="font-size:12px;margin-top:2px">${esc(x.artist)}</div></div><div class="my-m"><span class="mchip sm" style="--mc:${mo.c}"><i></i>${esc(mo.label)}</span><small>${rel(x.created_at)}</small></div></div>`; }).join('')}</div>`
      : `<div class="pf-empty">まだありません</div>`}
  </div>`;
}
const PF = { cache: new Map() };
function myPf() {
  const base = S.myPf || {};
  return { ...base, ...S.profile, id: api.uid, fav_songs: S.profile?.fav_songs || base.fav_songs || [], posts: S.mine, friends: S.friends.length,
    days: new Set(S.mine.map(p => dayKey(p.created_at))).size, rainbows: base.rainbows || [] };
}
async function loadMyPf() { try { S.myPf = await api.friendProfile(api.uid); } catch { /* v10.sql 未適用など */ } if (S.tab === 'me') renderMe(); else if (S.tab === 'home' && started) renderHome(); }
function renderMe() {
  const el = $('#t-me'); const p = S.profile || {};
  el.innerHTML = `
    <div class="hd"><h1 class="ellip">${esc(p.name || 'じぶん')}</h1><button class="icon-btn" data-act="settings" aria-label="設定">${I.gear}</button></div>
    ${api.user()?.anonymous && S.mine.length ? `<button class="notice" data-act="settings"><b>メールを登録しておこう</b><small>機種変更やデータ削除で、色の記録が消えないように</small>${I.back.replace('<svg', '<svg style="transform:rotate(180deg)"')}</button>` : ''}
    ${profileHTML(myPf(), true)}
    <div style="height:100px"></div>`;
}
async function openProfile(id) {
  if (!id) return;
  if (id === api.uid) { closeSheet(); setTab('me'); return; }
  closeSheet();
  const f = S.friends.find(x => x.id === id) || PF.cache.get(id);
  const head = subHead(esc(f?.name || ''));
  const pg = $('#pg-prof'); pg.innerHTML = `${head}<div class="page-body" id="pf-body">${f ? profileHTML({ ...f, posts: [], rainbows: [], fav_songs: [] }, false).replace('<div class="pf">', '<div class="pf loading">') : '<div style="padding:40px"><div class="spin" style="margin:auto"></div></div>'}</div>`;
  if (!pageStack.includes('pg-prof')) openPage('pg-prof');
  try {
    const d = await api.friendProfile(id); PF.cache.set(id, d); remember(d.posts || []);
    const b = $('#pf-body'); if (b && pageStack.includes('pg-prof')) b.innerHTML = profileHTML(d, false);
  } catch (e) { const b = $('#pf-body'); if (b) b.insertAdjacentHTML('beforeend', `<div class="pf-empty">${esc(errText(e))}</div>`); }
}
// フレンド一覧（インスタの「フォロー中」のように）
function friendsPage() {
  const rows = q => {
    const k = (q || '').trim().toLowerCase();
    const list = S.friends.filter(f => !k || f.name.toLowerCase().includes(k) || (f.bio || '').toLowerCase().includes(k));
    if (!S.friends.length) return `<div class="empty2"><b>まだフレンドがいません</b><p>招待コードを交換すると、ここに並びます。</p><button class="btn p" style="margin-top:16px" data-act="share-invite">${I.share} 招待リンクを送る</button></div>`;
    if (!list.length) return `<div class="empty2"><p>「${esc(q)}」は見つかりませんでした</p></div>`;
    return list.map(f => { const lp = f.last_post; const c = lp && isToday(lp.created_at) ? moodOf(lp.mood).c : null;
      return `<div class="fl-row"><button class="fl-who" data-act="profile" data-id="${esc(f.id)}"><span class="fl-av" ${c ? `style="--mc:${c}"` : ''}>${ava(f, 50)}</span><span class="fl-tx"><b class="ellip">${esc(f.name)}</b><small class="ellip">${lp ? `${esc(lp.title)} · ${rel(lp.created_at)}` : esc(f.bio || 'まだ色がありません')}</small></span></button>
        <button class="fl-btn" data-act="chat" data-id="${esc(f.id)}">メッセージ</button><button class="icon-btn sm" data-act="friend-menu" data-id="${esc(f.id)}" aria-label="メニュー">${I.more}</button></div>`; }).join('');
  };
  openSub(`${subHead(`フレンド ${S.friends.length}`, `<button class="icon-btn" style="background:none;border:none" data-act="add-friend" aria-label="フレンド追加">${I.userplus}</button>`)}
    <div class="page-body">${S.friends.length > 3 ? `<div class="srch" style="margin:10px 16px 6px">${I.search}<input id="fl-q" placeholder="検索" autocomplete="off"></div>` : ''}<div id="fl-list" style="padding-top:6px">${rows('')}</div></div>`, pg => {
    const q = pg.querySelector('#fl-q'); if (q) q.oninput = () => { $('#fl-list').innerHTML = rows(q.value); };
  });
}
function rainbowSheet(r, self) {
  const moods = RAINBOW_ORDER.map(e => (r.data?.moods || []).find(m => m.e === e)).filter(Boolean);
  openSheet(`<div style="padding:4px 22px 24px;text-align:center">
    <div class="faint" style="font-size:12px;letter-spacing:.1em">${new Date(r.day).getFullYear()}年${mdLabel(r.day).replace('/', '月')}日の虹</div>
    <div style="max-width:300px;margin:16px auto 14px">${miniRainbow(r.data, 300)}</div>
    <div class="rb-legend" style="justify-content:center">${moods.map(m => `<span class="mchip" style="--mc:${MOOD_META[m.e].c}"><i></i>${MOOD_META[m.e].label} ${m.n}人</span>`).join('')}</div>
    <div class="faint" style="font-size:12px;margin-top:12px">${r.data?.total || 1}人でつくった虹</div>
    ${self ? `<button class="btn g w" style="margin-top:20px" data-act="rb-del" data-id="${esc(r.id)}">コレクションから外す</button>` : ''}</div>`);
}

// ═══════════════════════ COMPOSER（気分 → 曲 → たす） ═══════════════════════
function renderComposer() {
  const mo = C.mood ? moodOf(C.mood) : null;
  const step = !C.mood ? 1 : !C.song ? 2 : 3;
  const head = (title, left = 'キャンセル', act = 'close-sheet') => `<div class="cmp-hd"><button class="cmp-l" data-act="${act}">${left}</button><div class="cmp-t">${title}</div><span class="cmp-step">${step}/3</span></div>`;
  let body;
  if (step === 1) body = `${head('いまの気分は？')}
    <p class="cmp-lead">言葉にしなくていい。いちばん近い色をえらんでね</p>
    <div class="moodgrid">${RAINBOW_ORDER.map(e => { const l = MOODS.find(([x]) => x === e)[1]; const o = MOOD_META[e]; return `<button class="mg" style="--mc:${o.c}" data-act="mood" data-m="${e} ${l}"><i></i><b>${o.label}</b><small>${esc(o.name || '')}</small></button>`; }).join('')}</div>`;
  else if (step === 2) body = `${head('その気分の1曲', '戻る', 'cmp-back')}
    <button class="cmp-mood" data-act="cmp-back" style="--mc:${mo.c}"><i></i>${esc(mo.label)}<small>変える</small></button>
    ${AI_ON ? `    <div class="ai-box">
      <div class="ai-hd">${I.spark}<b>この気分に合う3曲</b><small>AI</small></div>
      <div class="row" style="gap:8px"><input class="inp" id="ai-q" maxlength="100" placeholder="例：雨の帰り道" value="${esc(C.ai.q)}" enterkeyhint="go" autocomplete="off"><button class="btn p ai-btn" data-act="ai-go" ${C.ai.loading ? 'disabled' : ''}>${C.ai.loading ? '<span class="spin"></span>' : 'えらび直す'}</button></div>
      <div id="ai-res">${aiResults()}</div>
      <div class="ai-note">この3曲は人ではなくAI（${LIVE ? 'Anthropic Claude' : 'デモ'}）が選んでいます。気分の名前と書き足したひとことが送られます。名前など個人が分かることは書かないでね</div></div>
    <div class="or">または自分で探す</div>` : ''}

    <div class="srch">${I.search}<input id="cmp-q" placeholder="曲名・アーティスト名" value="${esc(C.q)}" enterkeyhint="search" autocomplete="off"><span id="cmp-spin"></span></div>
    <div id="cmp-res" style="padding-top:6px">${C.results.length ? C.results.map((s, i) => resRow(s, i)).join('') : chartPicks()}</div>`;
  else body = `${head('虹にたす', '戻る', 'unpick')}
    <div class="cmp-final" style="--mc:${mo.c}">
      <div class="cf-art">${art(C.song)}${playBtn(C.song)}</div>
      <div class="cf-ti ellip">${esc(C.song.title)}</div><div class="cf-ar ellip">${esc(C.song.artist)}</div>
      <button class="cmp-mood" data-act="cmp-back" style="--mc:${mo.c}"><i></i>${esc(mo.label)}<small>変える</small></button>
    </div>
    <div class="cf-c"><textarea class="inp" id="cmp-c" rows="2" maxlength="60" placeholder="ひとこと（なくてもOK）。聴いてくれた人にだけ開きます">${esc(C.comment)}</textarea><span id="cmp-n">${C.comment.length}/60</span></div>
    <button class="go-big" id="cmp-go" data-act="post" style="--mc:${mo.c}">この色を、今日の虹にたす</button>`;
  $('#cmp').innerHTML = `<div id="cmp-glow" class="glow-top"></div><div class="cmp-in">${body}</div>`;
  const q = $('#cmp-q'); if (q) q.oninput = () => { C.q = q.value; searchDebounced(); };
  const aq = $('#ai-q');
  if (aq) { aq.oninput = () => { C.ai.q = aq.value; }; aq.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); askAI(); } }; }
  const c = $('#cmp-c'); if (c) c.oninput = () => { C.comment = c.value; $('#cmp-n').textContent = `${c.value.length}/60`; };
  tintComposer();
}
// 検索欄が空のときは「いま聴かれている曲」から選べる
function chartPicks() {
  if (!S.loaded.chart) { loadChart().then(() => { if (!C.q && $('#cmp-res') && !C.results.length) $('#cmp-res').innerHTML = chartPicks(); }); return '<div class="faint" style="padding:18px;font-size:13px;text-align:center">いま頭の中で流れている曲は？</div>'; }
  if (!S.chart.length) return '<div class="faint" style="padding:18px;font-size:13px;text-align:center">いま頭の中で流れている曲は？</div>';
  return `<div class="faint" style="font-size:12px;padding:12px 4px 4px">いま日本で聴かれている曲</div>${S.chart.slice(0, 15).map((s, i) => `<div class="res" data-act="pick-chart" data-i="${i}">${art(s)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(s.artist)}</div></div>${playBtn(s, 'dim')}</div>`).join('')}`;
}
const resRow = (s, i) => `<div class="res" data-act="pick" data-i="${i}">${art(s)}<div style="flex:1;min-width:0"><div class="ellip" style="font-size:14px;font-weight:500">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px;margin-top:2px">${esc(s.artist)}</div></div>${playBtn(s, 'dim')}</div>`;
function aiResults() {
  const a = C.ai;
  if (a.loading) return `<div class="ai-wait"><span class="ai-dots" style="--mc:${C.mood ? moodOf(C.mood).c : '#ecebe7'}"><i></i><i></i><i></i></span>あなたの色に合う曲をさがしています</div>`;
  if (a.err) return `<div class="faint" style="font-size:12.5px;padding-top:10px">${esc(a.err)}</div>`;
  if (!a.songs.length) return '';
  return `<div style="padding-top:10px">${a.songs.map((s, i) => `<div class="ai-song tap" data-act="ai-pick" data-i="${i}">${art(s, 52)}<div style="flex:1;min-width:0"><div class="ellip" style="font-weight:600;font-size:14px">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px">${esc(s.artist)}</div>${s.reason ? `<div class="ai-why">${esc(s.reason)}</div>` : ''}</div>${playBtn(s, 'dim')}</div>`).join('')}
    <div class="row" style="justify-content:space-between;padding:4px 2px 0"><span class="faint" style="font-size:11px">${a.left != null ? `今日はあと${a.left}回` : ''}</span><button class="faint" style="font-size:12px;padding:8px" data-act="ai-go">ほかの曲</button></div></div>`;
}
async function askAI() {
  if (C.ai.loading) return;
  const mo = C.mood ? moodOf(C.mood) : null;
  const extra = (C.ai.q || '').trim();
  const text = [mo ? `気分は「${mo.label}」` : '', extra].filter(Boolean).join('。');
  if (!text) { toast('気分をえらんでね'); return; }
  $('#ai-q')?.blur();
  C.ai.loading = true; C.ai.err = ''; renderAI();
  try {
    const r = await api.recommend(text);
    if (r?.care) { C.ai.loading = false; C.ai.songs = []; C.ai.err = 'つらいときは、ひとりで抱えないでね。相談できる窓口があります'; renderAI(); careSheet(); return; }
    C.ai.songs = r.songs || []; C.ai.left = r.left ?? C.ai.left;
    remember2(C.ai.songs);
    if (!C.ai.songs.length) C.ai.err = 'ぴったりの曲が見つかりませんでした。ひとこと足して、もう一度ためしてね';
    buzz(8);
  } catch (e) { C.ai.err = errText(e) + (e?.message && !/^[A-Z_]+$/.test(e.message) ? '' : `（${e?.message || ''}）`); console.warn('ai', e); }
  C.ai.loading = false; renderAI();
}
function renderAI() {
  const r = $('#ai-res'); if (r) r.innerHTML = aiResults();
  const b = $('.ai-btn'); if (b) { b.disabled = C.ai.loading; b.innerHTML = C.ai.loading ? '<span class="spin"></span>' : 'えらび直す'; }
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
      <div class="set-row" data-act="toggle-push"><div class="grow">プッシュ通知<small>DM・贈りもの・シンクロ・フレンドの雨の日をお知らせ</small></div><div class="sw ${pushOn ? 'on' : ''}"></div></div>
      <div class="set-row" data-act="share-rain"><div class="grow">雨の日をフレンドに知らせる<small>悲しい・さみしい・モヤモヤの日に「雨みたい」と届きます</small></div><div class="sw ${p?.share_rain !== false ? 'on' : ''}"></div></div>
      ${isIOS && !standalone ? `<div class="set-row"><div class="grow" style="font-size:13px;color:var(--tx2);line-height:1.6">iPhoneで通知を受け取るには、Safariの共有ボタン <b>⬆︎</b> →「<b>ホーム画面に追加</b>」して、ホーム画面のアイコンから開いてください</div></div>` : ''}
    </div>
    <div class="set-title">安全</div>
    <div class="set-group">
      <div class="set-row" data-act="unblock"><div class="grow">ブロックをすべて解除</div></div>
      <div class="set-row"><div class="grow" style="font-size:13px;color:var(--tx2);line-height:1.7">・DMはフレンドどうしだけ<br>・「みんな」では名前が出ません<br>・困ったら投稿の「…」から通報・ブロック</div></div>
    </div>
    ${!LIVE ? `<div class="set-title">デモ</div><div class="set-group"><div class="set-row" data-act="demo-reset"><div class="grow">デモデータをリセット</div></div></div>` : ''}
    <div class="set-title">hearme</div>
    <div class="set-group">
      <div class="set-row" data-act="contact"><div class="grow">お問い合わせ</div><span class="faint">›</span></div>
      <a class="set-row" style="color:inherit;text-decoration:none" href="/terms.html" target="_blank" rel="noopener"><div class="grow">利用規約</div><span class="faint">↗</span></a>
      <a class="set-row" style="color:inherit;text-decoration:none" href="/privacy.html" target="_blank" rel="noopener"><div class="grow">プライバシーポリシー</div><span class="faint">↗</span></a>
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
    <div class="row" style="gap:8px"><input class="inp" id="fc" inputmode="text" enterkeyhint="done" placeholder="ABC123" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" style="text-transform:uppercase;letter-spacing:.3em;font-family:var(--disp);font-size:24px;text-align:center;height:56px"><button class="btn p" data-act="add-code" id="fc-go" style="height:56px" disabled>追加</button></div>
    <div class="faint" id="fc-hint" style="font-size:12px;text-align:center;margin-top:8px">6文字のコード、または招待リンクを貼り付け</div>
    <div class="card" style="margin-top:18px;padding:16px;text-align:center"><div class="faint" style="font-size:12px">あなたのコード</div><div class="bigcode" style="font-size:30px;margin:6px 0 12px">${esc(S.profile?.code)}</div>
      <button class="btn g w" data-act="share-invite" style="height:44px">${I.share} 招待リンクを送る</button></div></div>`);
  const fc = $('#fc');
  const norm = v => { const m = String(v).match(/[?&]inv=([A-Za-z0-9]{6})/); return (m ? m[1] : String(v)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); };
  fc.addEventListener('input', () => {
    const c = norm(fc.value); if (fc.value !== c) fc.value = c;
    $('#fc-go').disabled = c.length !== 6;
    $('#fc-hint').textContent = c.length === 6 ? `「${c}」を追加します` : c.length ? `あと${6 - c.length}文字` : '6文字のコード、または招待リンクを貼り付け';
  });
  fc.addEventListener('keydown', e => { if (e.key === 'Enter' && norm(fc.value).length === 6) $('#fc-go').click(); });
  setTimeout(() => fc.focus(), 350);
}
async function addByCode(code, { silent } = {}) {
  const m = String(code || '').match(/[?&]inv=([A-Za-z0-9]{6})/);
  code = (m ? m[1] : (code || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
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
    <button class="btn g w" style="margin-top:8px" data-act="gift" data-id="${esc(id)}">🎁 曲を贈る</button>
    <button class="btn g w" style="margin-top:8px" data-act="note" data-id="${esc(id)}">📓 交換ノート</button>
    <button class="btn g w" style="margin-top:8px" data-act="pair" data-id="${esc(id)}">🎂 2人のプレイリスト</button>
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

// ═══════════════════════ 通報・お問い合わせ ═══════════════════════
let REPORT_TARGET = null;
const REPORT_REASONS = ['いやがらせ・悪口', '性的・暴力的な内容', '個人情報の書き込み', '出会い目的・しつこい誘い', 'スパム・宣伝', 'その他'];
function reportSheet(target) {
  REPORT_TARGET = target;
  openSheet(`<div style="padding:4px 18px 24px"><div class="disp" style="font-size:20px;text-align:center;margin-bottom:6px">通報する理由</div>
    <div class="faint" style="font-size:12.5px;text-align:center;margin-bottom:14px">通報したことは相手に知られません</div>
    ${REPORT_REASONS.map(r => `<button class="btn g w" style="margin-bottom:8px;justify-content:flex-start" data-act="report-send" data-r="${esc(r)}">${esc(r)}</button>`).join('')}
    <div class="faint" style="font-size:12px;line-height:1.7;margin-top:6px">身の危険を感じたら、すぐに家族や先生、警察（#9110）に相談してね</div></div>`);
}
function contactSheet() {
  openSheet(`<div style="padding:4px 20px 24px"><div class="disp" style="font-size:20px;text-align:center;margin-bottom:6px">お問い合わせ</div>
    <div class="faint" style="font-size:12.5px;text-align:center;margin-bottom:14px">不具合・ご意見・ご要望など、なんでもどうぞ</div>
    <textarea class="inp" id="ct-text" rows="5" maxlength="180" placeholder="例：DMの通知が届きません（iPhone）"></textarea>
    <button class="btn p w" style="margin-top:10px" data-act="contact-send">送信</button>
    <div class="faint" style="font-size:11.5px;margin-top:10px;line-height:1.6">返信が必要な場合は、設定からメールを登録しておいてください</div></div>`);
  setTimeout(() => $('#ct-text')?.focus(), 350);
}

// ═══════════════════════ ホーム画面に追加 ═══════════════════════
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (S.tab === 'home' && started) renderHome(); });
function showInstallCard() {
  if (standalone) return false;
  if (launchDays() < 2) return false;   // v9.1：初日は出さない（まず虹を見てほしい）
  const d = +(localStorage.getItem('hm_install_dismiss') || 0);
  if (Date.now() - d < 7 * 86400000) return false;
  return !!deferredInstall || isIOS;
}
function installGuide() {
  openSheet(`<div style="padding:4px 22px 26px"><div class="disp" style="font-size:20px;text-align:center;margin-bottom:14px">ホーム画面に追加</div>
    ${isIOS ? `<div class="card" style="padding:16px;font-size:14px;line-height:2">① 画面下の共有ボタン <b>⬆︎</b> をタップ<br>② 「<b>ホーム画面に追加</b>」を選ぶ<br>③ 右上の「<b>追加</b>」をタップ</div>
      <div class="faint" style="font-size:12.5px;margin-top:12px;line-height:1.7">Safariで開いているときだけ追加できます。追加したアイコンから開くと、通知も受け取れます</div>`
      : `<div class="card" style="padding:16px;font-size:14px;line-height:2">ブラウザのメニュー（︙）から「<b>アプリをインストール</b>」または「<b>ホーム画面に追加</b>」を選んでください</div>`}</div>`);
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
  for (const s of [...S.chart, ...C.results, ...X.results, ...C.ai.songs]) if (s.preview_url === src) return s;
  for (const m of S.chat?.msgs || []) if (m.song?.preview_url === src) return m.song;
  if (S.extraSongs?.has(src)) return S.extraSongs.get(src);
  const st = music.player.state(); if (st.song?.preview_url === src) return st.song;
  return null;
}

// ═══════════════════════ ACTIONS ═══════════════════════
const A = {
  tab: el => setTab(el.dataset.tab),
  listen: el => goListen(el.dataset.id),
  profile: el => openProfile(el.dataset.id),
  'friends-list': () => friendsPage(),
  'pf-jump': el => { const t = el.closest('.page-body, .tab')?.querySelector(`[data-anchor="${el.dataset.to}"]`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'fav-add': () => openSongPicker(async s => {
    const fav = [...(S.profile?.fav_songs || [])];
    if (fav.length >= 5) { toast('お気に入りは5曲までです'); return; }
    if (fav.some(x => (x.track_id && x.track_id === s.track_id) || (x.title === s.title && x.artist === s.artist))) { toast('もう入っています'); return; }
    fav.push({ title: s.title, artist: s.artist, artwork: s.artwork || null, preview_url: s.preview_url || null, track_url: s.track_url || null, track_id: s.track_id || null });
    try { S.profile = await api.updateProfile({ fav_songs: fav }); buzz(8); toast('お気に入りに追加しました'); renderMe(); } catch (e) { toast(errText(e)); }
  }, 'お気に入りの曲を追加'),
  'fav-del': async el => {
    const fav = [...(S.profile?.fav_songs || [])]; fav.splice(+el.dataset.i, 1);
    try { S.profile = await api.updateProfile({ fav_songs: fav }); buzz(5); renderMe(); } catch (e) { toast(errText(e)); }
  },
  'rb-save': async () => {
    try { await api.saveRainbow(); buzz([8, 30, 8]); toast('今日の虹を「じぶん」のコレクションに残しました'); await loadMyPf(); if (S.tab === 'home') renderHome(); } catch (e) { toast(errText(e)); }
  },
  'rb-open': el => {
    const self = el.dataset.u === api.uid; const src = self ? myPf() : PF.cache.get(el.dataset.u);
    const r = src?.rainbows?.find(x => String(x.id) === el.dataset.id); if (r) rainbowSheet(r, self);
  },
  'rb-del': async el => {
    try { await api.deleteRainbow(el.dataset.id); closeSheet(); toast('外しました'); await loadMyPf(); } catch (e) { toast(errText(e)); }
  },
  'inbox-tab': el => { S.inbox = el.dataset.k; buzz(4); renderInbox(); if (S.inbox === 'm') refreshThreads(); },
  'cmp-back': () => { if (C.song && C.mood) { C.mood = null; } else { C.mood = null; C.song = null; } C.ai.songs = []; C.ai.err = ''; buzz(4); renderComposer(); },
  compose: () => { hideMoment(); openComposer(); },
  'close-sheet': () => closeSheet(),
  'close-page': () => closePage(),
  play: el => { const s = (el.dataset.post && S.posts.get(el.dataset.post)) || songBySrc(el.dataset.src); if (s) { buzz(5); music.player.toggle(s); } },
  stop: () => music.player.stop(),
  pick: el => { C.song = C.results[+el.dataset.i]; buzz(6); renderComposer(); },
  'pick-chart': el => { C.song = S.chart[+el.dataset.i]; buzz(6); renderComposer(); },
  'ai-go': () => askAI(),
  'ai-pick': el => { C.song = C.ai.songs[+el.dataset.i]; buzz(6); renderComposer(); },
  unpick: () => { C.song = null; renderComposer(); },
  mood: el => { C.mood = el.dataset.m; C.ai.songs = []; C.ai.err = ''; buzz(6); renderComposer(); if (AI_ON) askAI(); else setTimeout(() => $('#cmp-q')?.focus(), 300); },   // 気分をえらんだら、すぐAIが3曲さがす
  pubtoggle: el => { C.pub = !C.pub; el.querySelector('.sw').classList.toggle('on', C.pub); buzz(5); },
  post: () => submitPost(),
  'open-post': el => { const p = S.posts.get(el.dataset.id); if (p && !p.mine && listenQueue().some(x => x.id === p.id)) { ['pg-prof', 'pg-sub'].forEach(id => { if (pageStack.includes(id)) closePage(id); }); goListen(p.id); } else openPost(el.dataset.id); },
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
      b.innerHTML = rxInner(em, p.mine ? n : 0); if (em === next) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
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
  'retry-chart': () => { S.loaded.chart = false; renderExplore(); loadChart(); },
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
  'report-post': el => reportSheet({ postId: el.dataset.id }),
  'report-user': el => reportSheet({ userId: el.dataset.id }),
  'report-send': async el => {
    const t = REPORT_TARGET; if (!t) return; el.disabled = true;
    try { await api.report({ ...t, reason: el.dataset.r }); closeSheet(); toast('通報しました。確認して対応します'); }
    catch (e) { toast(errText(e)); el.disabled = false; }
  },
  contact: () => contactSheet(),
  'contact-send': async el => {
    const v = ($('#ct-text')?.value || '').trim(); if (v.length < 5) { toast('内容を5文字以上で書いてね'); return; }
    el.disabled = true;
    try { await api.report({ reason: ('[問い合わせ] ' + v).slice(0, 200) }); closeSheet(); toast('送信しました。ありがとう！'); }
    catch (e) { toast(errText(e)); el.disabled = false; }
  },
  'install-app': async () => {
    if (deferredInstall) { deferredInstall.prompt(); const r = await deferredInstall.userChoice.catch(() => null); deferredInstall = null; if (r?.outcome === 'accepted') toast('🎉 ホーム画面に追加しました'); render(); }
    else installGuide();
  },
  'install-dismiss': () => { try { localStorage.setItem('hm_install_dismiss', String(Date.now())); } catch { /* */ } render(); },
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
// ═══════════════════════════════════════════════════════════════
// v8 ── 「気持ちを届ける」15機能
// ═══════════════════════════════════════════════════════════════
const V8 = { started: new Set(), unlocking: new Set(), notifs: [], gifts: [], relays: [], letters: [], notes: [], night: [], careShown: false, listened: new Set(), G: null, sub: null };
const tone = m => { const e = splitMood(m || '')[0]; return ['😊', '🤩', '🔥', '🥰'].includes(e) ? 1 : ['😢', '🥺', '😤'].includes(e) ? -1 : 0; };
const WEATHER = m => { const e = splitMood(m || '')[0]; return e === '😴' ? '🌙' : e === '😤' ? '⛈️' : tone(m) > 0 ? '☀️' : tone(m) < 0 ? '🌧️' : '⛅'; };
const songOf = s => s ? ({ title: String(s.title || '').slice(0, 200), artist: String(s.artist || '').slice(0, 200),
  artwork: ART_RE.test(s.artwork || '') ? s.artwork : null, preview_url: PREVIEW_RE.test(s.preview_url || '') ? s.preview_url : null,
  track_url: TRACK_RE.test(s.track_url || '') ? s.track_url : null, track_id: s.track_id || null }) : null;
const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };
const songMini = (s, extra = '') => `<div class="song" style="padding:8px">${art(s, 46)}<div class="meta"><div class="ti ellip" style="font-size:14px">${esc(s?.title)}</div><div class="ar ellip">${esc(s?.artist)}</div></div>${playBtn(s, 'dim')}${extra}</div>`;
function remember2(list) { list.forEach(s => { if (s?.preview_url) S.extraSongs.set(s.preview_url, s); }); return list; }
S.extraSongs = new Map();

// ── 汎用サブページ ──
function openSub(html, onMount) {
  const pg = $('#pg-sub'); pg.innerHTML = html; pg.querySelector('.page-body')?.scrollTo(0, 0);
  if (!pageStack.includes('pg-sub')) openPage('pg-sub'); onMount?.(pg);
}
const subHead = (title, right = '') => `<div class="page-hd"><button class="back" data-act="close-page">${I.back}</button><div class="ttl disp ellip" style="font-size:18px">${title}</div>${right}</div>`;

// ── 通知（受信箱） ──
async function loadNotifs() { try { V8.notifs = await api.notifications(); } catch { /* v8.sql 未適用など */ } bell(); checkCare(); if (S.tab === 'home' && started) renderHome(); }
function bell() { badges(); if (S.tab === 'dm' && started) renderInbox(); }
function routeURL(url) {
  try { closeSheet(); handleDeepLink(new URL(url, location.origin).searchParams); } catch { /* */ }
}

// ── ⑮ 見守り ──
const HOTLINES = [
  ['24時間子供SOSダイヤル', '0120-0-78310', '24時間・無料・子ども向け'],
  ['チャイルドライン', '0120-99-7777', '18歳まで・無料'],
  ['よりそいホットライン', '0120-279-338', '無料・どんな悩みでも'],
  ['いのちの電話', '0120-783-556', '無料'],
  ['こころの健康相談統一ダイヤル', '0570-064-556', '各都道府県の窓口につながります（通話料あり）'],
];
function checkCare() {
  const c = V8.notifs.find(n => n.kind === 'care' && !n.read_at && isToday(n.created_at));
  if (c && !V8.careShown) { V8.careShown = true; V8.carePending = true; setTimeout(careSheet, 800); }
}
function careSheet() {
  V8.carePending = false; V8.careOpen = true;
  openSheet(`<div style="padding:4px 22px 26px">
    <div style="text-align:center;font-size:40px;margin-bottom:6px">🌙</div>
    <div class="disp" style="font-size:21px;text-align:center;margin-bottom:8px">少しだけ、話してみない？</div>
    <div class="muted" style="font-size:13.5px;line-height:1.8;text-align:center;margin-bottom:16px">最近つらい気持ちが続いているみたい。<br>ひとりで抱えなくて大丈夫。話を聞いてくれる人がいます。<br><span class="faint" style="font-size:12px">（この案内はあなたにだけ表示されています）</span></div>
    ${HOTLINES.map(([n, t, d]) => `<a class="set-row" style="border:1px solid var(--ln);border-radius:14px;margin-bottom:8px;text-decoration:none;color:inherit" href="tel:${t.replace(/-/g, '')}"><div class="grow"><b>${n}</b><small>${t}　${d}</small></div><span style="font-size:18px">📞</span></a>`).join('')}
    <a class="faint" style="display:block;text-align:center;font-size:12.5px;margin:10px 0 14px" href="https://shienjoho.go.jp/" target="_blank" rel="noopener">ほかの相談窓口（チャット・SNS相談もあります）↗</a>
    <button class="btn g w" data-act="care-ok">ありがとう、大丈夫</button></div>`, { full: true, onClose: () => { V8.careOpen = false; } });
  api.readNotifications().catch(() => {});
}

// ── ① 曲を贈る ──
function giftSheet(friendId, postId) {
  const f = S.friends.find(x => x.id === friendId); if (!f) { toast('フレンドにだけ贈れます'); return; }
  const p = postId ? S.posts.get(postId) : null;
  V8.G = V8.G?.to === friendId ? V8.G : { to: friendId, post: postId || null, song: null, message: '', anon: false, ai: [], aiLoading: false };
  const G = V8.G;
  const fp = p || S.feed.find(x => x.author?.id === friendId && isToday(x.created_at));
  const gc = fp ? moodOf(fp.mood).c : '#ecebe7';
  openSheet(`<div id="gift-glow" class="glow-top" style="background-color:${gc}"></div><div style="padding:4px 20px 24px;position:relative;--mc:${gc}">
    <div class="row" style="justify-content:center;gap:10px;margin-bottom:6px">${ava(f, 40)}<div class="disp" style="font-size:20px">${esc(f.name)}に曲を贈る</div></div>
    ${p ? `<div class="faint" style="text-align:center;font-size:12.5px;margin-bottom:12px">今日の気分：${esc(p.mood)}${p.comment ? `「${esc(p.comment)}」` : ''}</div>` : '<div style="height:10px"></div>'}
    ${G.song ? songMini(G.song, `<button class="icon-btn" style="width:30px;height:30px" data-act="gift-unpick">${I.x.replace('<svg', '<svg width="12" height="12"')}</button>`)
      : `<div class="row" style="gap:8px"><button class="btn g" style="flex:1" data-act="gift-pick">${I.search} 曲をさがす</button><button class="btn g" style="flex:1;border-color:var(--mc)" data-act="gift-ai" ${G.aiLoading ? 'disabled' : ''}>${G.aiLoading ? '<span class="spin"></span>' : `${I.spark} AIにえらんでもらう`}</button></div>
         ${G.ai.length ? `<div style="margin-top:10px">${G.ai.map((s, i) => `<div class="ai-song tap" data-act="gift-ai-pick" data-i="${i}">${art(s, 46)}<div style="flex:1;min-width:0"><div class="ellip" style="font-weight:600;font-size:14px">${esc(s.title)}</div><div class="ellip muted" style="font-size:12px">${esc(s.artist)}</div>${s.reason ? `<div style="font-size:12px;color:var(--cr2)">💬 ${esc(s.reason)}</div>` : ''}</div>${playBtn(s, 'dim')}</div>`).join('')}</div>` : ''}`}
    <textarea class="inp" id="g-msg" rows="2" maxlength="60" placeholder="ひとこと添える（なくてもOK）" style="margin-top:12px">${esc(G.message)}</textarea>
    <div class="toggle" data-act="gift-anon" style="padding:12px 2px"><div style="flex:1"><div style="font-size:14px;font-weight:600">名前を伏せて贈る</div><div class="faint" style="font-size:12px">「誰かが曲を贈ってくれた」とだけ届きます</div></div><div class="sw ${G.anon ? 'on' : ''}"></div></div>
    <button class="btn p w" style="background:${gc}" data-act="gift-send" ${G.song ? '' : 'disabled'}>${I.gift} 贈る</button></div>`, { full: G.ai.length > 0 });
  const m = $('#g-msg'); if (m) m.oninput = () => { G.message = m.value; };
}
async function giftsPage() {
  try { V8.gifts = await api.gifts(); } catch (e) { toast(errText(e)); return; }
  const rec = V8.gifts.filter(g => g.received), sent = V8.gifts.filter(g => !g.received);
  remember2(V8.gifts.map(g => g.song));
  const row = g => `<div class="card" style="margin:0 16px 10px;padding:12px">
      <div class="row" style="gap:8px;margin-bottom:8px">${g.received ? (g.from ? ava(g.from, 28) : '<div class="ava" style="width:28px;height:28px;font-size:14px">🤫</div>') : ava(g.to, 28)}
        <div style="flex:1;font-size:13px">${g.received ? `<b>${esc(g.from?.name || '誰か')}</b>から` : `<b>${esc(g.to?.name)}</b>へ`}${g.anonymous && !g.received ? '（匿名）' : ''}</div><div class="faint" style="font-size:11px">${rel(g.created_at)}</div></div>
      ${songMini(g.song)}${g.message ? `<div style="font-size:13.5px;margin-top:8px">「${esc(g.message)}」</div>` : ''}
      ${g.received && !g.opened_at ? `<button class="btn p sm" style="margin-top:8px" data-act="gift-open" data-id="${esc(g.id)}">💌 受け取る</button>` : ''}</div>`;
  openSub(`${subHead('🎁 贈りもの')}<div class="page-body">
    <div class="sec"><span class="lbl">届いた曲</span></div>${rec.length ? rec.map(row).join('') : `<div class="empty" style="padding:20px">まだ届いていません</div>`}
    <div class="sec"><span class="lbl">贈った曲</span></div>${sent.length ? sent.map(row).join('') : `<div class="empty" style="padding:20px">フレンドの投稿の🎁から、曲を贈れます</div>`}</div>`);
  rec.filter(g => !g.opened_at).forEach(() => {});
}

// ── ② 聴いてくれたよ（5秒以上再生したら） ──
// ① 聴かないと読めない：15秒聴いたら、ひとことが開く
const LISTEN_SEC = 15;
music.player.subscribe(st => {
  const s = st.song; const p = s?.id && S.posts.get(s.id);
  if (p && !p.mine && st.playing && !V8.started.has(p.id)) { V8.started.add(p.id); api.startListen(p.id).then(ok => { if (!ok) V8.started.delete(p.id); }); }   // サーバーに「聴きはじめた」を記録（届かなければ次の再生でまた送る）
  if (p && !p.mine) {
    $$(`[data-ring="${p.id}"]`).forEach(ring => ring.style.setProperty('--pct', `${Math.min(100, (st.t / LISTEN_SEC) * 100)}%`));
    $$(`[data-lock="${p.id}"] span`).forEach(lock => { if (st.playing && st.t < LISTEN_SEC) lock.textContent = `あと${Math.ceil(LISTEN_SEC - st.t)}秒で、ひとことが開きます`; });
  }
  if (!st.playing || !p || p.mine || st.t < LISTEN_SEC || V8.listened.has(p.id) || V8.unlocking.has(p.id)) return;
  unlockComment(p);
});
// ひとことを開く処理は、ここ1か所だけで動かす（同時に1つ・失敗したら2.5秒あけて最大8回）
// 再生中のイベントからは、処理中・待機中なら何もしない（間隔が詰まらないように）
function unlockComment(p, n = 0) {
  if (V8.listened.has(p.id)) { V8.unlocking.delete(p.id); return; }
  if (n === 0 && V8.unlocking.has(p.id)) return;
  V8.unlocking.add(p.id);
  const again = () => {
    if (n + 1 >= 8) { V8.unlocking.delete(p.id); return; }   // あきらめたら、次に再生したときにまた最初から
    setTimeout(() => unlockComment(p, n + 1), 2500);
  };
  (async () => {
    // 「聴きはじめた」の記録が届いていなければ、先に送り直す（その場合は記録から14秒後に開く）
    if (!V8.started.has(p.id)) { V8.started.add(p.id); if (!await api.startListen(p.id)) { V8.started.delete(p.id); again(); return; } }
    try {
      const r = await api.markListened(p.id);
      V8.listened.add(p.id); V8.unlocking.delete(p.id);
      p.i_listened = true; if (r?.comment != null) p.comment = r.comment;
      $$(`.slide[data-post="${p.id}"]`).forEach(sl => {
        const cm = sl.querySelector('.sl-cm'); if (cm) cm.innerHTML = p.comment ? `<p class="cm-open unlocked">${esc(p.comment)}</p>` : '';
        sl.querySelector('.listen-ring')?.classList.add('done');
      });
      $$(`.post[data-post="${p.id}"]`).forEach(card => { const tmp = document.createElement('div'); tmp.innerHTML = postCard(p); const el = tmp.firstElementChild; el.classList.add('unlocked'); card.replaceWith(el); });
      badges(); if (S.tab === 'home') renderHome();
      if (p.comment) buzz([8, 30, 8]);
    } catch { again(); }
  })();
}

// ④ 今日の虹
function rainbowHTML() {
  const R = S.rainbow;
  if (!R) return `<div class="rb-wrap"><div class="sk" style="height:200px;border-radius:200px 200px 0 0;margin:0 6px"></div></div>`;
  const moods = RAINBOW_ORDER.map(e => (R.moods || []).find(m => m.e === e)).filter(Boolean);
  const people = Math.max(1, R.total || 1), FULL = 110;
  const TH = Math.min(FULL, 14 + 16 * (people - 1));
  const W = Math.min(innerWidth / ZOOM, 480) - 40, Rr = Math.round(W / 2), cy = Rr + 4;
  let r = Rr; const bands = [];
  const posted = moods.reduce((a, m) => a + m.n, 0);
  const add = (key, n, c, dashed) => { const t = Math.max(5, Math.round(TH * n / people)); bands.push({ key, r, t, c, dashed }); r -= t; };
  moods.forEach(m => add(m.e, m.n, MOOD_META[m.e]?.c || '#ccc', false));
  // まだ自分がたしていないときは、自分の分を淡く（押すと投稿へ）。ほかの人の空きはさらに薄く
  if (!R.me) add('me', 1, 'rgba(236,235,231,.16)', 'me');
  const others = Math.max(0, (R.waiting || 0) - (R.me ? 0 : 1));
  if (others) add('wait', others, 'rgba(236,235,231,.06)', true);
  const pick = S.rbPick;
  const band = b => `<button class="rb-band ${b.dashed === 'me' ? 'mine-empty' : b.dashed ? 'dash' : ''} ${S.justAdded === b.key ? 'rb-new' : ''}" ${b.dashed === 'me' ? 'data-act="compose"' : b.dashed ? 'tabindex="-1"' : `data-act="rb-pick" data-e="${b.key}"`} aria-label="${b.dashed === 'me' ? 'あなたの色をたす' : b.dashed ? 'まだの人' : esc(MOOD_META[b.key]?.label || '')}"
      style="left:${Rr - b.r}px;top:${cy - b.r}px;width:${b.r * 2}px;height:${b.r}px;border-width:${b.t}px ${b.t}px 0 ${b.t}px;border-color:${b.c};border-radius:${b.r}px ${b.r}px 0 0;opacity:${pick && pick !== b.key ? .3 : 1}"></button>`;
  const meE = R.me; const meC = meE ? MOOD_META[meE]?.c : null;
  const headline = people <= 1 ? (meE ? 'あなたの色で、虹が始まりました' : '今日の虹は、まだ空のまま')
    : !posted ? '今日の虹は、まだ空のまま' : people === 2 ? 'ふたりの虹' : `${people}人でつくる虹`;
  const sub = people <= 1 ? (meE ? '友達の色が重なると、虹が太くなります' : '気分をえらぶと、あなたの色で虹が始まります')
    : R.waiting ? `あと${R.waiting}人がまだ空のまま` : 'みんなの色がそろいました';
  const tk = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
  const savedRb = (S.myPf?.rainbows || []).find(r => String(r.day).slice(0, 10) === tk);
  const savedN = savedRb ? (savedRb.data?.moods || []).reduce((a, m) => a + (m.n || 0), 0) : 0;
  const savedToday = !!savedRb && savedN >= posted && (savedRb.data?.total || 0) >= people;   // 色が増えたら、残し直せる
  const pm = pick && moods.find(m => m.e === pick);
  return `<div class="rb-wrap">
    <div class="lbl" style="letter-spacing:.12em">今日の虹</div>
    <div class="rb-head">${headline}</div>
    <div class="rb" style="width:${W}px;height:${cy + 2}px">
      ${TH < FULL ? `<div class="rb-ghost" style="left:0;top:4px;width:${W}px;height:${Rr}px;border-radius:${Rr}px ${Rr}px 0 0"></div><div class="rb-ghost" style="left:${FULL}px;top:${4 + FULL}px;width:${W - FULL * 2}px;height:${Rr - FULL}px;border-radius:${Rr - FULL}px ${Rr - FULL}px 0 0"></div>` : ''}
      <div class="rb-glow">${bands.filter(b => !b.dashed).map(band).join('')}</div>
      ${bands.map(band).join('')}
      <div class="rb-sub">${sub}</div>
    </div>
    <div class="rb-legend">${moods.map(m => `<button class="mchip ${pick === m.e ? 'on' : ''}" style="--mc:${MOOD_META[m.e].c}" data-act="rb-pick" data-e="${m.e}"><i></i>${MOOD_META[m.e].label} ${m.n}${m.n > 1 || people > 1 ? '人' : ''}</button>`).join('')}
      ${!meE ? `<button class="mchip add" data-act="compose">${I.plus.replace('<svg', '<svg width="12" height="12"')} あなたの色をたす</button>` : ''}
      ${posted && !savedToday ? `<button class="rb-keep" data-act="rb-save">${I.plus.replace('<svg', '<svg width="12" height="12"')} ${savedRb ? `いまの虹で残し直す（${posted}色）` : '今日の虹を残す'}</button>` : posted && savedToday ? `<span class="rb-kept">${I.check} 残しました</span>` : ''}</div>
    <div class="rb-hint">色は気分、太さは集まった人の数</div>
    ${pm ? `<div class="rb-pick" style="--mc:${MOOD_META[pm.e].c}"><b>${MOOD_META[pm.e].label}</b>　${pm.names.map(esc).join('・')}
      ${moodOf(pm.e + ' x').label && ['😢', '🥺', '😤'].includes(pm.e) ? `<div class="rb-gifts">${pm.ids.filter(id => S.friends.some(f => f.id === id)).map(id => { const f = S.friends.find(x => x.id === id); return `<button class="gift-btn" style="--mc:${MOOD_META[pm.e].c}" data-act="gift" data-id="${esc(id)}">${I.gift} ${esc(f.name)}に贈る</button>`; }).join('')}</div>` : ''}</div>` : ''}
    ${meC ? '' : ''}
  </div>`;
}
// ②③ 今日の寄り添い・シンクロ
function bannersHTML() {
  const today = V8.notifs.filter(n => isToday(n.created_at));
  const out = [];
  const sync = today.find(n => n.kind === 'sync');
  if (sync) out.push(`<button class="banner" style="--mc:#F5C76B" data-act="notif-go" data-url="${esc(sync.url)}"><span class="b-ic">${I.spark}</span><span class="b-tx"><b>${esc(sync.title.replace(/^✨\s*/, ''))}</b><small>${esc(sync.body)}</small></span></button>`);
  today.filter(n => n.kind === 'rain').slice(0, 2).forEach(n => {
    const fid = n.data?.friend; const f = S.friends.find(x => x.id === fid); if (!f) return;
    out.push(`<div class="banner" style="--mc:#6FA0E6">${ava(f, 34)}<span class="b-tx"><b>${esc(n.title.replace(/^🌧\s*/, ''))}</b><small>寄り添う1曲を贈る？</small></span><button class="btn sm gift-btn" style="--mc:#6FA0E6" data-act="gift" data-id="${esc(fid)}" data-post="${esc(n.data?.post || '')}">贈る</button></div>`);
  });
  return out.join('');
}
// 自分の今日の色（FAB・じぶん画面）
function myColor() { const p = postedToday()[0]; return p ? moodOf(p.mood).c : null; }
function applyMyColor() { const c = myColor(); document.documentElement.style.setProperty('--me', c || '#ecebe7'); document.documentElement.style.setProperty('--me-glow', c ? c + '55' : 'rgba(236,235,231,.15)'); }

// ── ③ 同じ気持ちの人 ──
async function sameMoodSheet(mood) {
  if (V8.carePending || V8.careOpen) return;   // 見守りの案内を優先
  openSheet(`<div style="padding:10px 20px 30px;text-align:center"><div class="spin" style="margin:30px auto"></div></div>`);
  let r; try { r = await api.sameMood(mood); } catch (e) { closeSheet(); toast(errText(e)); return; }
  if (V8.carePending || V8.careOpen) return;
  const [e, l] = splitMood(mood); remember2(r.songs || []);
  openSheet(`<div style="padding:4px 20px 24px">
    <div style="text-align:center;font-size:44px">${esc(e)}</div>
    <div class="disp" style="font-size:22px;text-align:center;margin:6px 0">${r.count ? `今日、あなたと同じ「${esc(l || e)}」の人が<br><span style="color:var(--cr);font-size:30px">${r.count}人</span>います` : '今日いちばん乗りの気持ちです'}</div>
    <div class="muted" style="font-size:13px;text-align:center;margin-bottom:16px">${r.count ? 'ひとりじゃないよ。みんなが選んだ曲を聴いてみる？' : 'あとから同じ気持ちの人が来るかも'}</div>
    ${(r.songs || []).map(s => `<div style="margin-bottom:8px">${songMini(s)}</div>`).join('')}
    ${r.songs?.length ? '<div class="faint" style="font-size:11.5px;text-align:center;margin-top:6px">誰が選んだかは表示されません</div>' : ''}</div>`, { full: (r.songs || []).length > 3 });
}

// ── ⑨ きもち天気図 ──
function weatherHTML() {
  if (!S.friends.length) return '';
  const todays = new Map();
  S.feed.filter(p => !p.mine && isToday(p.created_at)).forEach(p => { if (!todays.has(p.author?.id)) todays.set(p.author?.id, p); });
  const cells = S.friends.map(f => {
    const p = todays.get(f.id); const w = p ? WEATHER(p.mood) : '・';
    return `<div class="wx" data-act="${p ? 'open-post' : 'friend-latest'}" data-id="${esc(p ? p.id : f.id)}"><div class="wx-ava">${ava(f, 46)}<span class="wx-ic">${w}</span></div><small class="ellip">${esc(f.name)}</small>${p && tone(p.mood) < 0 ? `<button class="wx-gift" data-act="gift" data-id="${esc(f.id)}" data-post="${esc(p.id)}" aria-label="曲を贈る">🎁</button>` : ''}</div>`;
  }).join('');
  const rainy = [...todays.values()].filter(p => tone(p.mood) < 0).length;
  return `<div class="sec" style="padding-top:4px"><span class="lbl">きもち天気</span>${rainy ? `<span class="faint" style="font-size:11px">🌧️ ${rainy}人が雨模様。曲を贈ってみる？</span>` : ''}</div><div class="wx-row">${cells}</div>`;
}

// ── ⑬ 回復ログ ──
function recoveryHTML() {
  const today = S.mine.filter(p => isToday(p.created_at));
  if (!today.length || tone(today[0].mood) < 1) return '';
  const past = S.mine.filter(p => !isToday(p.created_at) && Date.now() - new Date(p.created_at) < 7 * 864e5 && tone(p.mood) < 0);
  if (!past.length) return '';
  const days = Math.max(1, Math.round((Date.now() - new Date(past[0].created_at)) / 864e5));
  return `<div class="card" style="margin:0 16px 12px;padding:14px;border-color:rgba(255,176,48,.3);background:linear-gradient(135deg,rgba(255,176,48,.08),transparent)">
    <div style="font-weight:700;font-size:14.5px">🌤️ ${days}日前より、少し晴れたね</div>
    <div class="muted" style="font-size:12px;margin:3px 0 10px">あのとき支えになった曲</div>
    ${past.slice(0, 2).map(p => `<div style="margin-bottom:6px">${songMini(p)}</div>`).join('')}</div>`;
}

// ── ⑥ 夜だけのひとりごと ──
function nightCardHTML() {
  if (!isNight()) return '';
  return `<div class="cta tap" data-act="night" style="background:linear-gradient(135deg,rgba(167,139,250,.14),rgba(7,7,8,0));border-color:rgba(167,139,250,.3)"><div class="ic" style="background:rgba(167,139,250,.18);font-size:20px">🌙</div><div style="flex:1"><div style="font-weight:600;font-size:15px">夜のひとりごと</div><div class="muted" style="font-size:12px;margin-top:2px">22時〜朝6時だけ。名前は出ず、朝には消えます</div></div><div class="faint">›</div></div>`;
}
async function nightPage() {
  if (!isNight()) { toast('ひとりごとは夜22時〜朝6時だけ開いています'); return; }
  try { V8.night = await api.nightFeed(); } catch (e) { toast(errText(e)); return; }
  remember2(V8.night.map(w => w.song).filter(Boolean));
  const W = V8.W ||= { text: '', mood: '', song: null };
  openSub(`${subHead('🌙 夜のひとりごと')}<div class="page-body" style="background:linear-gradient(#0c0b16,var(--bg) 40%)">
    <div class="card" style="margin:12px 16px;padding:14px">
      <textarea class="inp" id="w-text" rows="2" maxlength="80" placeholder="眠れない夜の、ひとりごと">${esc(W.text)}</textarea>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0">${MOODS.map(([e, l]) => `<button class="chip ${W.mood === e + ' ' + l ? 'on-chip' : ''}" data-act="w-mood" data-m="${e} ${l}">${e}</button>`).join('')}</div>
      ${W.song ? songMini(W.song, `<button class="icon-btn" style="width:30px;height:30px" data-act="w-unsong">${I.x.replace('<svg', '<svg width="12" height="12"')}</button>`) : `<button class="btn g sm" data-act="w-song">🎵 曲もそえる</button>`}
      <button class="btn p w" style="margin-top:10px" data-act="w-post">つぶやく</button>
      <div class="faint" style="font-size:11px;margin-top:8px;line-height:1.6">名前やアイコンは出ません。朝6時に全部消えます。悪口や個人情報はNG</div></div>
    ${V8.night.length ? V8.night.map(w => `<div class="card" style="margin:0 16px 10px;padding:14px">
      <div class="row" style="gap:8px;margin-bottom:6px"><span style="font-size:18px">${esc(w.emoji)}</span><span class="faint" style="font-size:11.5px;flex:1">${w.mine ? 'あなた' : 'どこかの誰か'} · ${rel(w.created_at)}</span>${w.mood ? `<span class="chip">${esc(splitMood(w.mood)[0])}</span>` : ''}</div>
      <div style="font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(w.text)}</div>
      ${w.song ? `<div style="margin-top:8px">${songMini(w.song)}</div>` : ''}
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">${w.mine ? `<span class="faint" style="font-size:12px">🫂 ${w.hugs || 0}人がそっと寄り添った</span>` : `<button class="rx ${w.hugged ? 'on' : ''}" data-act="w-hug" data-id="${esc(w.id)}">🫂 ${w.hugged ? 'よりそった' : 'よりそう'}</button><button class="faint" style="font-size:11px;padding:6px" data-act="w-report" data-id="${esc(w.id)}">通報</button>`}</div></div>`).join('')
      : `<div class="empty">まだ静かな夜です</div>`}</div>`, pg => { const t = pg.querySelector('#w-text'); if (t) t.oninput = () => { W.text = t.value; }; });
}

// ── ⑦ 曲リレー ──
function relayCardsHTML() {
  const act = V8.relays.filter(r => new Date(r.ends_at) > new Date());
  if (!S.friends.length && !act.length) return '';
  return `<div class="sec"><span class="lbl">🔗 曲リレー</span><button class="faint" style="font-size:12px" data-act="relay-new">＋ はじめる</button></div>
    <div class="hero-chart" style="padding-bottom:14px">${act.map(r => `<div class="relay-card tap" data-act="relay" data-id="${esc(r.id)}"><div class="faint" style="font-size:11px">${esc(r.creator?.name)}のテーマ</div><div style="font-weight:700;font-size:15px;margin:2px 0 8px" class="ellip">${esc(r.theme)}</div><div class="row" style="gap:-6px">${r.songs.slice(-4).map(s => art(s.song, 34)).join('')}</div><div class="faint" style="font-size:11px;margin-top:6px">${r.songs.length}曲 · のこり${Math.max(0, Math.ceil((new Date(r.ends_at) - Date.now()) / 864e5))}日</div></div>`).join('') ||
      `<div class="relay-card tap" data-act="relay-new"><div style="font-weight:700;font-size:14px">テーマを決めて<br>フレンドと1曲ずつつなごう</div><div class="faint" style="font-size:11px;margin-top:6px">例：雨の日に聴きたい曲</div></div>`}</div>`;
}
function relayPage(id) {
  const r = V8.relays.find(x => x.id === id); if (!r) { loadRelays().then(() => V8.relays.find(x => x.id === id) && relayPage(id)); return; }
  remember2(r.songs.map(s => s.song));
  const last = r.songs[r.songs.length - 1]; const ended = new Date(r.ends_at) < new Date();
  openSub(`${subHead('🔗 ' + esc(r.theme))}<div class="page-body">
    <div class="faint" style="font-size:12px;padding:12px 18px">${esc(r.creator?.name)}がはじめたリレー · ${r.songs.length}曲 · ${ended ? '終了' : `のこり${Math.ceil((new Date(r.ends_at) - Date.now()) / 864e5)}日`}</div>
    ${r.songs.map((s, i) => `<div class="relay-step"><div class="relay-n">${i + 1}</div><div style="flex:1;min-width:0"><div class="faint" style="font-size:11.5px;margin-bottom:4px">${esc(s.by?.name)}${s.note ? ` 「${esc(s.note)}」` : ''}</div>${songMini(s.song)}</div></div>`).join('')}
    ${ended ? '' : last?.mine ? `<div class="empty" style="padding:20px">次は誰かがつないでくれるのを待とう</div>` : `<div style="padding:10px 18px 30px"><button class="btn p w" data-act="relay-add" data-id="${esc(r.id)}">＋ 次の1曲をつなぐ</button></div>`}</div>`);
}
async function loadRelays() { try { V8.relays = await api.relays(); } catch { V8.relays = []; } }

// ── ⑩ 未来の自分へ ──
async function lettersPage() {
  try { V8.letters = await api.letters(); } catch (e) { toast(errText(e)); return; }
  remember2(V8.letters.map(l => l.song).filter(Boolean));
  const L = V8.L ||= { song: null, text: '', days: 30 };
  openSub(`${subHead('💌 未来の自分へ')}<div class="page-body">
    <div class="card" style="margin:12px 16px;padding:14px">
      <div style="font-weight:700;font-size:14.5px;margin-bottom:4px">今の気持ちを、未来の自分に届けよう</div>
      <div class="faint" style="font-size:12px;margin-bottom:10px">届く日まで、自分でも中身は見られません</div>
      ${L.song ? songMini(L.song, `<button class="icon-btn" style="width:30px;height:30px" data-act="l-unsong">${I.x.replace('<svg', '<svg width="12" height="12"')}</button>`) : `<button class="btn g w" data-act="l-song">🎵 届ける曲を選ぶ</button>`}
      <textarea class="inp" id="l-text" rows="3" maxlength="140" placeholder="未来の自分へのひとこと" style="margin-top:10px">${esc(L.text)}</textarea>
      <div class="seg" style="margin-top:10px">${[[7, '1週間後'], [30, '1ヶ月後'], [100, '100日後'], [365, '1年後']].map(([d, t]) => `<button class="${L.days === d ? 'on' : ''}" data-act="l-days" data-d="${d}">${t}</button>`).join('')}</div>
      <button class="btn p w" style="margin-top:12px" data-act="l-send" ${L.song ? '' : 'disabled'}>封をして送る</button></div>
    <div class="sec"><span class="lbl">手紙</span></div>
    ${V8.letters.length ? V8.letters.map(l => l.delivered_at ? `<div class="card" style="margin:0 16px 10px;padding:12px"><div class="faint" style="font-size:11.5px;margin-bottom:6px">💌 ${new Date(l.created_at).toLocaleDateString('ja-JP')}のあなたより${l.mood ? ' · ' + esc(l.mood) : ''}</div>${songMini(l.song)}${l.text ? `<div style="font-size:14px;margin-top:8px;line-height:1.7">「${esc(l.text)}」</div>` : ''}</div>`
      : `<div class="card row" style="margin:0 16px 10px;padding:14px"><span style="font-size:24px">✉️</span><div style="flex:1"><div style="font-size:14px;font-weight:600">封をした手紙</div><div class="faint" style="font-size:12px">${new Date(l.deliver_at).toLocaleDateString('ja-JP')} に届きます</div></div></div>`).join('')
      : `<div class="empty" style="padding:20px">まだ手紙はありません</div>`}</div>`, pg => { const t = pg.querySelector('#l-text'); if (t) t.oninput = () => { L.text = t.value; }; });
}

// ── ⑪ 2人だけの交換ノート ──
async function notePage(friendId) {
  const f = S.friends.find(x => x.id === friendId); if (!f) { toast('フレンドとだけ交換ノートができます'); return; }
  let n; try { n = await api.openNote(friendId); } catch (e) { toast(errText(e)); return; }
  remember2(n.entries.map(e => e.song));
  const todayKey = new Date().toISOString().slice(0, 10);
  const mineToday = n.entries.find(e => e.mine && e.day === todayKey);
  const days = [...new Set(n.entries.map(e => e.day))];
  const N = V8.N = { friend: friendId, song: null, text: '' };
  openSub(`${subHead('📓 ' + esc(f.name) + 'との交換ノート')}<div class="page-body">
    <div class="row" style="justify-content:center;gap:14px;padding:16px 0 6px">${ava(S.profile, 44)}<span style="font-size:20px">📓</span>${ava(f, 44)}</div>
    <div class="faint" style="text-align:center;font-size:12px;margin-bottom:12px">${days.length}日分の曲を交換しました</div>
    ${mineToday ? '' : `<div class="card" style="margin:0 16px 14px;padding:14px"><div style="font-weight:700;font-size:14px;margin-bottom:8px">今日の1曲を書く</div><div id="n-song"><button class="btn g w" data-act="n-song">🎵 曲を選ぶ</button></div><textarea class="inp" id="n-text" rows="2" maxlength="60" placeholder="ひとこと" style="margin-top:8px"></textarea><button class="btn p w" style="margin-top:8px" data-act="n-send" disabled>ノートに書く</button></div>`}
    ${days.map(d => `<div class="day" style="display:table;margin:12px auto 8px">${dayLabel(d + 'T12:00:00')}</div>${n.entries.filter(e => e.day === d).map(e => `<div style="margin:0 16px 8px;${e.mine ? 'margin-left:48px' : 'margin-right:48px'}">${songMini(e.song)}${e.text ? `<div style="font-size:13px;margin-top:4px;${e.mine ? 'text-align:right' : ''}">${esc(e.text)}</div>` : ''}</div>`).join('')}`).join('') || `<div class="empty" style="padding:20px">1日1曲ずつ、2人だけのノートを作ろう</div>`}</div>`,
    pg => { const t = pg.querySelector('#n-text'); if (t) t.oninput = () => { N.text = t.value; }; });
}
async function notesPage() {
  try { V8.notes = await api.notes(); } catch (e) { toast(errText(e)); return; }
  openSub(`${subHead('📓 交換ノート')}<div class="page-body">
    ${V8.notes.map(n => `<div class="th" data-act="note" data-id="${esc(n.friend?.id)}">${ava(n.friend, 46)}<div class="info"><div class="nm">${esc(n.friend?.name)}</div><div class="pv">${n.days}日 · ${n.today_me ? '今日は書いた✓' : '今日まだ書いてない'}${n.today_them ? ' · 相手は書いた' : ''}</div></div></div>`).join('')}
    <div class="sec"><span class="lbl">フレンドと始める</span></div>
    ${S.friends.filter(f => !V8.notes.some(n => n.friend?.id === f.id)).map(f => `<div class="th" data-act="note" data-id="${esc(f.id)}">${ava(f, 40)}<div class="info"><div class="nm">${esc(f.name)}</div></div><span class="faint">＋</span></div>`).join('') || '<div class="faint" style="padding:0 18px;font-size:13px">フレンドを招待すると始められます</div>'}</div>`);
}

// ── ⑭ 2人のプレイリスト ──
async function pairPage(friendId) {
  const f = S.friends.find(x => x.id === friendId); if (!f) return;
  let r; try { r = await api.pairPlaylist(friendId); } catch (e) { toast(errText(e)); return; }
  if (!r) return;
  remember2(r.songs || []);
  const days = Math.max(1, Math.round((Date.now() - new Date(r.since)) / 864e5));
  openSub(`${subHead('🎂 ' + esc(f.name) + 'との' + days + '日')}<div class="page-body">
    <div class="row" style="justify-content:center;gap:14px;padding:18px 0 6px">${ava(S.profile, 48)}<span style="font-size:22px">🤝</span>${ava(f, 48)}</div>
    <div class="disp" style="text-align:center;font-size:20px">2人のプレイリスト</div>
    <div class="faint" style="text-align:center;font-size:12px;margin:4px 0 14px">つながってから${days}日 · ${(r.songs || []).length}曲</div>
    ${(r.songs || []).map(s => `<div style="margin:0 16px 8px">${songMini(s, `<span class="faint" style="font-size:10.5px;white-space:nowrap">${s.mine ? 'あなた' : esc(f.name)}${s.from === 'gift' ? '🎁' : ''}</span>`)}</div>`).join('') || '<div class="empty">まだ曲がありません</div>'}</div>`);
}

// ── ④ 月末のきもちの記録 ＋ ⑫ ストーリー用カード ──
function monthPosts(offset = 0) {
  const d = new Date(); d.setMonth(d.getMonth() + offset, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1, list: S.mine.filter(p => { const x = new Date(p.created_at); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); }) };
}
async function recapPage(offset = 0) {
  const { y, m, list } = monthPosts(offset);
  V8.R = { offset, y, m, list, ai: V8.R?.offset === offset ? V8.R.ai : null, loading: false };
  const counts = {}; list.forEach(p => { const e = splitMood(p.mood)[0]; counts[e] = (counts[e] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const artists = {}; list.forEach(p => { artists[p.artist] = (artists[p.artist] || 0) + 1; });
  const topA = Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 3);
  remember2(list);
  const R = V8.R;
  openSub(`${subHead(`🗓 ${m}月のきもち`, `<button class="faint" style="font-size:12px;padding:6px" data-act="recap-prev">‹ 先月</button>${offset < 0 ? `<button class="faint" style="font-size:12px;padding:6px" data-act="recap-next">次月 ›</button>` : ''}`)}<div class="page-body">
    ${list.length ? `
    <div class="card" style="margin:14px 16px;padding:18px;text-align:center;background:linear-gradient(160deg,rgba(167,139,250,.14),rgba(62,207,197,.06))">
      <div class="faint" style="font-size:12px">${y}年${m}月</div>
      <div class="disp" style="font-size:26px;margin:4px 0 2px">${R.ai ? esc(R.ai.title) : `${list.length}曲の${m}月`}</div>
      <div style="font-size:34px;letter-spacing:4px;margin:8px 0">${top.slice(0, 5).map(([e]) => e).join('')}</div>
      ${R.ai ? `<div style="font-size:14px;line-height:1.8;text-align:left;margin-top:8px">${esc(R.ai.summary)}</div><div style="font-size:13px;color:var(--cr2);margin-top:10px">💬 ${esc(R.ai.word)}</div>`
        : `<button class="btn g sm" style="margin-top:6px" data-act="recap-ai" id="recap-ai">✨ AIにふり返ってもらう</button>`}
    </div>
    <div class="card box"><h3>気分の流れ</h3><div class="mood-line">${list.slice().reverse().map(p => `<span title="${esc(p.mood)}" style="background:${MOOD_COLOR[splitMood(p.mood)[0]] || '#e9e4d8'}"></span>`).join('')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">${top.map(([e, n]) => `<span class="chip">${e} ${n}回</span>`).join('')}</div></div>
    ${topA.length ? `<div class="card box"><h3>よく選んだアーティスト</h3>${topA.map(([a, n], i) => `<div class="li"><b style="width:18px">${i + 1}</b><div style="flex:1" class="ellip">${esc(a)}</div><span class="faint" style="font-size:12px">${n}曲</span></div>`).join('')}</div>` : ''}
    <div class="sec"><span class="lbl">${m}月のプレイリスト</span></div>
    ${list.map(p => `<div style="margin:0 16px 8px">${songMini(p)}</div>`).join('')}
    <div style="padding:10px 16px 30px"><button class="btn p w" data-act="recap-card">📸 ストーリー用の画像をつくる</button></div>`
      : `<div class="empty"><span class="e-ic">🗓</span>${m}月はまだシェアがありません</div>`}</div>`);
}
// ストーリー用 1080x1920 画像
function loadImg(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = () => res(null);
    i.src = ART_RE.test(src) ? `/api/art?u=${encodeURIComponent(src)}` : src;
  });
}
function wrapText(ctx, text, x, y, maxW, lh, maxLines = 3) {
  let line = '', lines = [];
  for (const ch of String(text)) { const t = line + ch; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = ch; } else line = t; }
  if (line) lines.push(line);
  lines = lines.slice(0, maxLines); lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); return lines.length * lh;
}
async function storyCard({ kind, post, recap }) {
  toast('画像をつくっています…');
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1080, 1920); grd.addColorStop(0, '#1b1d29'); grd.addColorStop(.55, '#0b0b0f'); grd.addColorStop(1, '#070708');
  g.fillStyle = grd; g.fillRect(0, 0, 1080, 1920);
  const logo = await loadImg('/logo-mark.png');
  const F = '"Hiragino Sans","Noto Sans JP","DM Sans",sans-serif';
  g.textAlign = 'center'; g.fillStyle = '#e9e4d8';
  if (kind === 'post') {
    const im = await loadImg(post.artwork);
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 60;
    const s = 760, x = 160, y = 330; g.beginPath(); g.roundRect(x, y, s, s, 48); g.clip();
    if (im) g.drawImage(im, x, y, s, s); else { g.fillStyle = '#1e1f23'; g.fillRect(x, y, s, s); }
    g.restore();
    g.fillStyle = '#e9e4d8'; g.font = `800 64px ${F}`; wrapText(g, post.title, 540, 1210, 900, 76, 2);
    g.fillStyle = '#8a8d95'; g.font = `500 40px ${F}`; g.fillText(post.artist, 540, 1370);
    g.font = `80px ${F}`; g.fillText(splitMood(post.mood)[0], 540, 1500);
    if (post.comment) { g.fillStyle = '#c3bdaf'; g.font = `500 42px ${F}`; wrapText(g, `「${post.comment}」`, 540, 1600, 860, 58, 2); }
    g.fillStyle = '#8a8d95'; g.font = `600 36px ${F}`; g.fillText('今日の1曲', 540, 250);
  } else {
    g.fillStyle = '#8a8d95'; g.font = `600 40px ${F}`; g.fillText(`${recap.y}年${recap.m}月のきもち`, 540, 260);
    g.fillStyle = '#e9e4d8'; g.font = `800 76px ${F}`; wrapText(g, recap.title, 540, 380, 940, 90, 2);
    g.font = `110px ${F}`; g.fillText(recap.emojis, 540, 600);
    const arts = await Promise.all(recap.list.slice(0, 9).map(p => loadImg(p.artwork)));
    arts.forEach((im, i) => { const s = 280, gap = 20, x = 120 + (i % 3) * (s + gap), y = 700 + Math.floor(i / 3) * (s + gap); g.save(); g.beginPath(); g.roundRect(x, y, s, s, 24); g.clip(); if (im) g.drawImage(im, x, y, s, s); else { g.fillStyle = '#1e1f23'; g.fillRect(x, y, s, s); } g.restore(); });
    g.fillStyle = '#c3bdaf'; g.font = `500 40px ${F}`; wrapText(g, recap.summary || `${recap.list.length}曲をシェアしました`, 540, 1640, 900, 56, 3);
  }
  if (logo) g.drawImage(logo, 470, 1760, 56, 60);
  g.fillStyle = '#e9e4d8'; g.font = `800 44px ${F}`; g.textAlign = 'left'; g.fillText('hearme', 540, 1806);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (!blob) { toast('画像を作れませんでした'); return; }
  const file = new File([blob], 'hearme.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'hearme' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hearme.png'; a.click();
  toast('画像を保存しました');
}

// ── ⑧ 気分のグラデーション ──
function padHTML() {
  const x = C.mx ?? null, y = C.my ?? null;
  return `<div class="pad" id="mood-pad"><span class="pad-l t">あかるい</span><span class="pad-l b">さみしい</span><span class="pad-l l">しずか</span><span class="pad-l r">元気</span>${x != null ? `<i class="pad-dot" style="left:${(x + 100) / 2}%;top:${(100 - y) / 2}%"></i>` : '<span class="pad-hint">指でなぞって、今の気分を</span>'}</div>`;
}
function padMood(x, y) {
  if (y > 40 && x > 40) return '🤩 アガる'; if (y > 40 && x < -20) return '😌 穏やか'; if (y > 30) return '😊 嬉しい';
  if (y < -40 && x < -20) return '🥺 寂しい'; if (y < -40) return '😢 悲しい'; if (x > 50) return '🔥 熱い';
  if (x < -50) return '😴 眠い'; if (y < -10 && x > 20) return '😤 モヤモヤ'; return '💭 考え中';
}
function bindPad() {
  const el = $('#mood-pad'); if (!el || el._bound) return; el._bound = true;
  const set = e => {
    // 表示サイズ（zoom）対策：ブラウザによって座標の単位が違うので、要素の実寸と比べて合わせる
    const r = el.getBoundingClientRect();
    const k = Math.abs(r.width - el.offsetWidth * ZOOM) <= Math.abs(r.width - el.offsetWidth) ? 1 : ZOOM;
    const fx = (e.clientX / k - r.left) / r.width, fy = (e.clientY / k - r.top) / r.height;
    C.mx = Math.round(Math.max(-100, Math.min(100, fx * 200 - 100)));
    C.my = Math.round(Math.max(-100, Math.min(100, 100 - fy * 200)));
    let dot = el.querySelector('.pad-dot'); el.querySelector('.pad-hint')?.remove();
    if (!dot) { dot = document.createElement('i'); dot.className = 'pad-dot'; el.appendChild(dot); }
    dot.style.left = `${(C.mx + 100) / 2}%`; dot.style.top = `${(100 - C.my) / 2}%`;
    const m = padMood(C.mx, C.my);
    if (m !== C.mood) { C.mood = m; buzz(4); $$('.md2').forEach(b => b.classList.toggle('on', b.dataset.m === C.mood)); tintComposer(); }
    const go = $('#cmp-go'); if (go) go.disabled = !(C.song && C.mood);
  };
  let down = false;
  el.addEventListener('pointerdown', e => { down = true; try { el.setPointerCapture(e.pointerId); } catch { /* */ } set(e); });
  el.addEventListener('pointermove', e => { if (down) set(e); });
  const up = () => { down = false; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

// ── 読み込み ──
async function loadV8() { await Promise.all([loadNotifs(), loadRelays()]); if (S.tab === 'home') renderHome(); }

// ── アクション ──
Object.assign(A, {
  'rb-pick': el => { S.rbPick = S.rbPick === el.dataset.e ? null : el.dataset.e; buzz(5); renderHome(); },
  'share-rain': async el => {
    const sw = el.querySelector('.sw'); const on = !sw.classList.contains('on');
    try { S.profile = await api.updateProfile({ share_rain: on }); sw.classList.toggle('on', on); toast(on ? '雨の日をフレンドに知らせます' : '雨の日は知らせません'); } catch (e) { toast(errText(e)); }
  },
  inbox: () => openInbox(),
  'notif-go': el => routeURL(el.dataset.url),
  'care-ok': () => closeSheet(),
  gift: (el, e) => { e?.stopPropagation(); V8.G = null; giftSheet(el.dataset.id, el.dataset.post); },
  'gift-pick': () => openSongPicker(s => { V8.G.song = songOf(s); giftSheet(V8.G.to, V8.G.post); }),
  'gift-unpick': () => { V8.G.song = null; giftSheet(V8.G.to, V8.G.post); },
  'gift-ai': async () => {
    const G = V8.G; const p = G.post ? S.posts.get(G.post) : null; const f = S.friends.find(x => x.id === G.to);
    G.aiLoading = true; giftSheet(G.to, G.post);
    try { const r = await api.recommend(`友達（${f?.name || ''}）の今日の気分は「${p?.mood || '少し元気がない'}」${p?.comment ? '、ひとこと「' + p.comment + '」' : ''}。寄り添って元気づける曲を贈りたい`); G.ai = remember2(r.songs || []); }
    catch (e) { toast(errText(e)); }
    G.aiLoading = false; giftSheet(G.to, G.post);
  },
  'gift-ai-pick': el => { V8.G.song = songOf(V8.G.ai[+el.dataset.i]); V8.G.ai = []; giftSheet(V8.G.to, V8.G.post); },
  'gift-anon': el => { V8.G.anon = !V8.G.anon; el.querySelector('.sw').classList.toggle('on', V8.G.anon); buzz(5); },
  'gift-send': async el => {
    const G = V8.G; if (!G?.song) return; el.disabled = true;
    try { await api.sendGift(G.to, G.song, G.message.trim(), G.anon, G.post); buzz([10, 40, 10]); closeSheet(); toast(G.anon ? '🎁 名前を伏せて贈りました' : '🎁 曲を贈りました'); V8.G = null; }
    catch (e) { toast(errText(e)); el.disabled = false; }
  },
  gifts: () => giftsPage(),
  'gift-open': async el => { await api.openGift(el.dataset.id).catch(() => {}); buzz(10); toast('💌 受け取りました'); giftsPage(); },
  'same-mood': el => sameMoodSheet(el.dataset.m),
  night: () => nightPage(),
  'w-mood': el => { V8.W.mood = V8.W.mood === el.dataset.m ? '' : el.dataset.m; $$('[data-act="w-mood"]').forEach(b => b.classList.toggle('on-chip', b.dataset.m === V8.W.mood)); },
  'w-song': () => openSongPicker(s => { V8.W.song = songOf(s); nightPage(); }),
  'w-unsong': () => { V8.W.song = null; nightPage(); },
  'w-post': async el => {
    const W = V8.W; const t = (W.text || '').trim(); if (!t) { toast('ひとことを書いてね'); return; }
    el.disabled = true;
    try { await api.postWhisper(t, W.mood, W.song); V8.W = { text: '', mood: '', song: null }; toast('🌙 つぶやきました'); nightPage(); loadNotifs(); }
    catch (e) { toast(errText(e)); el.disabled = false; }
  },
  'w-hug': async el => { await api.hugWhisper(el.dataset.id).catch(() => {}); el.classList.add('on', 'pop'); el.textContent = '🫂 よりそった'; buzz(8); },
  'w-report': async el => { if (!await confirmSheet({ title: 'このひとりごとを通報？', ok: '通報', danger: true })) return; await api.reportWhisper(el.dataset.id, 'whisper').catch(() => {}); toast('通報しました'); },
  relay: el => relayPage(el.dataset.id),
  'relay-new': () => {
    openSheet(`<div style="padding:4px 20px 24px"><div class="disp" style="font-size:20px;text-align:center;margin-bottom:6px">曲リレーをはじめる</div><div class="faint" style="font-size:12.5px;text-align:center;margin-bottom:14px">テーマに合う曲を、フレンドと1曲ずつつないでいこう（7日間）</div>
      <input class="inp" id="rl-theme" maxlength="30" placeholder="テーマ（例：雨の日に聴きたい曲）"><div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0">${['雨の日に聴きたい曲', '夜に聴きたい曲', '元気が出る曲', '泣ける曲', '青春っぽい曲'].map(t => `<button class="chip" data-act="rl-preset" data-t="${t}">${t}</button>`).join('')}</div>
      <button class="btn p w" data-act="rl-next">最初の1曲を選ぶ →</button></div>`);
  },
  'rl-preset': el => { $('#rl-theme').value = el.dataset.t; },
  'rl-next': () => {
    const theme = ($('#rl-theme')?.value || '').trim(); if (!theme) { toast('テーマを決めてね'); return; }
    openSongPicker(async s => { try { const r = await api.startRelay(theme, songOf(s), ''); toast('🔗 リレーをはじめました'); await loadRelays(); relayPage(r.id); render(); } catch (e) { toast(errText(e)); } });
  },
  'relay-add': el => openSongPicker(async s => { try { await api.addRelaySong(el.dataset.id, songOf(s), ''); toast('🔗 つなぎました'); await loadRelays(); relayPage(el.dataset.id); } catch (e) { toast(errText(e)); } }),
  letters: () => lettersPage(),
  'l-song': () => openSongPicker(s => { V8.L.song = songOf(s); lettersPage(); }),
  'l-unsong': () => { V8.L.song = null; lettersPage(); },
  'l-days': el => { V8.L.days = +el.dataset.d; $$('[data-act="l-days"]').forEach(b => b.classList.toggle('on', b === el)); },
  'l-send': async el => {
    const L = V8.L; if (!L.song) return; el.disabled = true;
    try { const r = await api.writeLetter(L.song, L.text.trim(), postedToday()[0]?.mood || '', L.days); V8.L = { song: null, text: '', days: 30 }; toast(`💌 ${new Date(r.deliver_at).toLocaleDateString('ja-JP')}に届きます`); lettersPage(); }
    catch (e) { toast(errText(e)); el.disabled = false; }
  },
  notes: () => notesPage(),
  note: el => { closeSheet(); notePage(el.dataset.id); },
  'n-song': () => openSongPicker(s => { V8.N.song = songOf(s); const box = $('#n-song'); if (box) box.innerHTML = songMini(V8.N.song); const b = $('[data-act="n-send"]'); if (b) b.disabled = false; }),
  'n-send': async el => {
    const N = V8.N; if (!N?.song) return; el.disabled = true;
    try { await api.addNoteEntry(N.friend, N.song, (N.text || '').trim()); toast('📓 書きました'); notePage(N.friend); } catch (e) { toast(errText(e)); el.disabled = false; }
  },
  pair: el => { closeSheet(); pairPage(el.dataset.id); },
  recap: () => recapPage(0),
  'recap-prev': () => recapPage((V8.R?.offset || 0) - 1),
  'recap-next': () => recapPage(Math.min(0, (V8.R?.offset || 0) + 1)),
  'recap-ai': async el => {
    const R = V8.R; el.disabled = true; el.innerHTML = '<span class="spin"></span> ふり返っています…';
    try { R.ai = await api.recap(R.list.slice().reverse().map(p => ({ day: p.created_at, mood: p.mood, title: p.title, artist: p.artist }))); recapPage(R.offset); }
    catch (e) { toast(errText(e)); el.disabled = false; el.textContent = '✨ AIにふり返ってもらう'; }
  },
  'recap-card': () => { const R = V8.R; const counts = {}; R.list.forEach(p => { const e = splitMood(p.mood)[0]; counts[e] = (counts[e] || 0) + 1; }); storyCard({ kind: 'recap', recap: { y: R.y, m: R.m, list: R.list, title: R.ai?.title || `${R.list.length}曲の${R.m}月`, summary: R.ai?.summary, emojis: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e).join('') } }); },
  'story-post': el => { const p = S.posts.get(el.dataset.id); if (p) storyCard({ kind: 'post', post: p }); },
});

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
    try { S.rainbow = await api.todayRainbow(); } catch { S.rainbow = { total: 1, waiting: postedToday().length ? 0 : 1, me: postedToday()[0] ? moodOf(postedToday()[0].mood).e : null, moods: postedToday()[0] ? [{ e: moodOf(postedToday()[0].mood).e, n: 1, names: ['あなた'], ids: [] }] : [] }; }
    applyMyColor();
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
  loadMyPf();
  try { S.activity = await api.activity(); } catch { /* */ }
  badges(); if (S.tab === 'me') renderMe();
}
async function loadMoment() { return;   // v9：時間システムは廃止
}
async function loadMomentOld() {
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
    if (p?.mine && r?.emoji) { toast(`「${p.title}」に${RX_META[r.emoji]?.l ? `「${RX_META[r.emoji].l}」が` : 'リアクションが'}届きました`); buzz(8); }
    await Promise.all([loadFeeds(), refreshMe()]);
  });
  let pT; api.on('post', () => { clearTimeout(pT); pT = setTimeout(loadFeeds, 600); });
  api.on('moment', m => { S.moment = { at: m.at }; showMoment(); render(); });
  api.on('notification', n => {
    V8.notifs.unshift(n); bell();
    if (n.kind === 'care') { V8.careShown = false; checkCare(); return; }
    if (document.visibilityState === 'visible') toast(n.title); buzz(8);
    if (n.kind === 'relay') loadRelays().then(() => S.tab === 'home' && renderHome());
    if (['sync', 'rain', 'sync_mood'].includes(n.kind) && S.tab === 'home') renderHome();
  });
}

// ═══════════════════════ ONBOARDING / AUTH ═══════════════════════
const OB = { step: 'welcome', emoji: '🎧', avatar: null, name: '', bio: '', agree: false };
const CONSENT_VER = '2026-10-20';
function needConsent() {
  OB.agree = !!$('#ob-agree')?.checked;
  if (!OB.agree) { toast('利用規約とプライバシーポリシーへの同意が必要です'); $('.consent')?.classList.add('shake'); setTimeout(() => $('.consent')?.classList.remove('shake'), 500); return true; }
  try { localStorage.setItem('hm_consent', CONSENT_VER); } catch { /* */ }
  return false;
}
function showOB(step) { OB.step = step; $('#ob').classList.remove('hide'); renderOB(); }
function renderOB() {
  const ob = $('#ob'); const st = OB.step;
  const dots = n => `<div class="dots">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  if (st === 'welcome') {
    ob.innerHTML = `<div class="ob-inner"><div class="welcome"><img src="/logo-mark.png" alt=""><h1>hearme</h1><div class="tag">きもちを、音楽で届ける</div><div class="wave">${[5, 12, 20, 9, 24, 13, 6].map((h, i) => `<i style="height:${h}px;animation-delay:${i * .1}s"></i>`).join('')}</div>
      <div class="muted" style="font-size:13.5px;line-height:1.9;margin-top:34px">今日の気分を、1曲とひとつの色に。<br>友達の色が重なって、毎日ちがう虹になる。</div></div>
      <label class="consent"><input type="checkbox" id="ob-agree" ${OB.agree ? 'checked' : ''}><span><b>13歳以上</b>で、<a href="/terms.html" target="_blank" rel="noopener">利用規約</a>と<a href="/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>に同意します<br><small>18歳未満の方は保護者の同意を得てください</small></span></label>
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
    ob.innerHTML = `<div class="ob-inner">${dots(3)}<h2>大事なときだけ<br>そっと知らせます</h2><p class="sub">フレンドの空が雨のとき、曲が贈られたとき、シンクロしたとき、DMが届いたとき。毎日の「投稿しろ」通知はありません</p>
      <div class="card" style="padding:20px;text-align:center;margin-bottom:12px"><div style="font-size:44px;margin-bottom:6px">🔔</div><div class="muted" style="font-size:13px;line-height:1.7">${canPush ? '通知をオンにして、フレンドの気持ちを受け取ろう' : isIOS ? 'iPhoneでは、Safariの共有ボタン ⬆︎ →「<b>ホーム画面に追加</b>」してから開くと通知を受け取れます' : 'このブラウザでは通知が使えません'}</div></div>
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
    if (needConsent()) return;
    el.disabled = true;
    try { if (!api.user()) S.user = await api.signInAnon(); showOB('profile'); }
    catch (err) { toast(errText(err)); el.disabled = false; }
  } else if (a === 'login') { if (needConsent()) return; showOB('login'); }
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
  loadV8();
  // 招待リンク（すでに登録済みの人）
  const inv = pendingInvite(); if (inv) { sessionStorage.removeItem('hm_inv'); await addByCode(inv); }
  { let lt = ''; try { lt = sessionStorage.getItem('hm_tab') || ''; } catch { /* */ }
    if (!location.search && ['listen', 'dm', 'me'].includes(lt)) setTab(lt); }   // 再読み込みしても、さっきのタブのまま
  handleDeepLink(new URLSearchParams(location.search));
  history.replaceState({ hm: 'base' }, '', '/'); history.pushState({ hm: 'app' }, '');
  if (!LIVE) enrichDemo();
  // 戻ってきたら更新
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { api.refreshUser?.().then(u => { if (u && S.user?.email !== u.email) { S.user = u; if (pageStack.includes('pg-settings')) openSettings(); if (u.email && !u.anonymous) toast('✅ メールの登録が完了しました'); } }).catch(() => {}); loadFeeds(); refreshThreads(); loadMoment(); if (S.chat) { const c0 = S.chat; api.messages(c0.peer.id).then(m => { if (S.chat === c0) { S.chat.msgs = m; drawChat(); api.markRead(S.chat.peer.id); } }).catch(() => {}); } }
  });
}
function handleDeepLink(q) {
  if (q.get('dm')) openChat(q.get('dm'));
  else if (q.get('moment')) { if (momentActive()) openComposer(); }
  else if (q.get('compose')) openComposer();
  else if (q.get('giftto')) giftSheet(q.get('giftto'), q.get('post') || null);
  else if (q.get('gift')) giftsPage();
  else if (q.get('post')) { const p = S.posts.get(q.get('post')); if (p) { if (!p.mine) goListen(p.id); else openPost(p.id); } }
  else if (q.get('care')) careSheet();
  else if (q.get('tab')) { const t = { explore: 'listen', inbox: 'dm' }[q.get('tab')] || q.get('tab'); if (['home', 'listen', 'dm', 'me'].includes(t)) setTab(t); }
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

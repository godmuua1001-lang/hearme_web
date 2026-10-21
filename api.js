// hearme data layer — Supabase（本番）とデモ（端末内）の2実装、同じインターフェース
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const LIVE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const ERR = {
  POST_LIMIT: '今日はもう3回投稿しました。また明日！',
  CODE_NOT_FOUND: 'コードが見つかりません',
  SELF_CODE: '自分のコードは追加できません',
  NOT_ALLOWED: 'この操作はできません',
  NOT_SIGNED_IN: 'ログインし直してください',
  TOO_MANY_TRIES: '試行回数が多すぎます。しばらく時間をおいてね',
  GIFT_LIMIT: '今日はもうたくさん贈りました。また明日！',
  NOT_NIGHT: 'ひとりごとは夜22時〜朝6時だけ開いています',
  WHISPER_LIMIT: '今夜はもう5回つぶやきました',
  RELAY_TWICE: '連続ではつなげません。誰かが次をつなぐのを待ってね',
  RELAY_ENDED: 'このリレーは終わりました',
  RELAY_FULL: 'このリレーは30曲で完成しました',
  RELAY_LIMIT: 'リレーは1日3つまでです',
  LETTER_LIMIT: '届く前の手紙は20通までです',
  AI_LIMIT: '今日のAI選曲は上限に達しました。また明日！',
  AI_BUSY: 'AIが混み合っています。少し待ってもう一度試してね',
  AI_ERROR: 'AIがうまく答えられませんでした。言い方を変えて試してね',
  EMPTY_RAINBOW: 'まだ今日の虹に色がありません',
  RATE_LIMIT: '送りすぎです。少し時間をおいてね',
  NOT_FOUND: '見つかりませんでした',
};
export function errText(e) {
  const m = String(e?.message || e || '');
  for (const k in ERR) if (m.includes(k)) return ERR[k];
  if (/row-level security/i.test(m)) return 'フレンドにしか送れません';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '通信できませんでした。電波を確認してね';
  if (/rate limit/i.test(m)) return '少し時間をおいてもう一度試してね';
  if (/Token has expired|invalid/i.test(m)) return 'コードが違うか期限切れです';
  return m || 'エラーが発生しました';
}

// 実機テスト用：URLに ?hmtest=start2 や ?hmtest=mark3 を付けると、その回数だけ通信失敗をわざと起こす（この端末のこのタブだけ。タブを閉じると元に戻る）
const HMTEST = (() => { try { const v = new URLSearchParams(location.search).get('hmtest') || sessionStorage.getItem('hm_test') || ''; if (v) sessionStorage.setItem('hm_test', v); const m = v.match(/^(start|mark)(\d)$/); return m ? { kind: m[1], left: +m[2] } : null; } catch { return null; } })();
const fakeFail = kind => { if (HMTEST && HMTEST.kind === kind && HMTEST.left > 0) { HMTEST.left--; console.info('[hmtest] わざと失敗', kind, '残り', HMTEST.left); return true; } return false; };
const PCOLS = 'id,name,emoji,avatar,bio,created_at,fav_songs';
const pairKey = (a, b) => [a, b].sort().join('_');

// ═════════════════════ SUPABASE ═════════════════════
class LiveAPI {
  constructor() { this.live = true; this.handlers = {}; this.typingCh = {}; }

  async init() {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    this.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    this.sb.auth.onAuthStateChange((_e, s) => { this.session = s; });
    if (!this.session) return { user: null, profile: null };
    return { user: this.user(), profile: await this.myProfile() };
  }
  user() {
    const u = this.session?.user;
    return u ? { id: u.id, email: u.email || null, anonymous: !!u.is_anonymous,
      providers: (u.identities || []).map(i => i.provider) } : null;
  }
  get uid() { return this.session?.user?.id; }
  _r({ data, error }) { if (error) throw error; return data; }

  // ── auth ──
  async signInAnon() {
    const d = this._r(await this.sb.auth.signInAnonymously());
    this.session = d.session; return this.user();
  }
  async sendEmailCode(email, { link }) {
    const emailRedirectTo = location.origin + '/';
    if (link) return this._r(await this.sb.auth.updateUser({ email }, { emailRedirectTo }));      // 匿名→メール引き継ぎ
    return this._r(await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo } }));
  }
  async verifyEmailCode(email, token, { link }) {
    const d = this._r(await this.sb.auth.verifyOtp({ email, token, type: link ? 'email_change' : 'email' }));
    if (d.session) this.session = d.session;
    else { const s = await this.sb.auth.getSession(); this.session = s.data.session; }
    return this.user();
  }
  async refreshUser() {
    const { data } = await this.sb.auth.getUser();
    if (data?.user && this.session) this.session = { ...this.session, user: data.user };
    return this.user();
  }
  async google({ link }) {
    const opts = { provider: 'google', options: { redirectTo: location.origin + '/' } };
    return this._r(link ? await this.sb.auth.linkIdentity(opts) : await this.sb.auth.signInWithOAuth(opts));
  }
  async signOut() { this.stop(); await this.sb.auth.signOut(); this.session = null; }

  // ── profile ──
  // 招待コード・設定は本人だけが関数経由で読む（v10.1：フレンドからはコードが見えない）
  async _withSettings(p) {
    if (!p) return p;
    let s = null;
    try { s = this._r(await this.sb.rpc('my_settings')); } catch { /* v10.1.sql 未適用 */ }
    if (!s) { const r = await this.sb.from('profiles').select('code,share_rain').eq('id', this.uid).maybeSingle(); s = r.data || {}; }
    return { ...p, ...s };
  }
  async myProfile() {
    return this._withSettings(this._r(await this.sb.from('profiles').select(PCOLS).eq('id', this.uid).maybeSingle()));
  }
  async createProfile(p) {
    return this._withSettings(this._r(await this.sb.from('profiles').upsert({ id: this.uid, ...p }).select(PCOLS).single()));
  }
  async updateProfile(p) {
    const r = this._r(await this.sb.from('profiles').update(p).eq('id', this.uid).select(PCOLS).single());
    return this._withSettings(r);
  }
  async deleteMe() { this._r(await this.sb.rpc('delete_me')); await this.signOut(); }

  // ── friends ──
  async addFriend(code) {
    const d = this._r(await this.sb.rpc('add_friend', { p_code: code }));
    if (d?.error) throw new Error(d.error);
    return d;
  }
  async removeFriend(id) { return this._r(await this.sb.rpc('remove_friend', { p_id: id })); }
  async friends() { return this._r(await this.sb.rpc('my_friends')) || []; }
  async blockUser(id) { return this._r(await this.sb.rpc('block_user', { p_id: id })); }
  async blockPostAuthor(postId) { return this._r(await this.sb.rpc('block_post_author', { p_post: postId })); }
  async unblockAll() { return this._r(await this.sb.rpc('unblock_all')); }
  async report(r) {
    return this._r(await this.sb.from('reports').insert({ post_id: r.postId || null, target_user: r.userId || null, reason: r.reason || '' }));
  }

  // ── posts ──
  async friendFeed() { return this._r(await this.sb.rpc('friend_feed', { p_limit: 60 })) || []; }
  async publicFeed(before) { return this._r(await this.sb.rpc('public_feed', { p_limit: 30, p_before: before || null })) || []; }
  async myPosts() { return this._r(await this.sb.rpc('my_posts', { p_limit: 120 })) || []; }
  async createPost(p) { return this._r(await this.sb.from('posts').insert(p).select('id').single()); }
  async deletePost(id) { return this._r(await this.sb.from('posts').delete().eq('id', id)); }
  async react(postId, emoji) { return this._r(await this.sb.rpc('react', { p_post: postId, p_emoji: emoji })); }
  async activity() { return this._r(await this.sb.rpc('my_activity', { p_limit: 40 })) || []; }
  async todayMoment() { return this._r(await this.sb.rpc('today_moment')); }

  // ── AI選曲（Edge Function recommend） ──
  async recommend(text) {
    const { data, error } = await this.sb.functions.invoke('recommend', { body: { text, raw: true } });
    if (error) {
      let code = '';
      try { code = (await error.context.json()).error; } catch { /* */ }
      throw new Error(code || error.message);
    }
    if (data?.songs) return data;   // 古いサーバー（実在確認済みで返す版）
    // AIの候補を、端末側で iTunes 検索して実在確認（3曲そろったら終わり）
    const { search } = await import('./music.js');
    const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[\s'’"“”・\-–—!！?？.,、。()（）]/g, '');
    const found = await Promise.all((data?.ideas || []).map(async i => {
      try {
        const res = await search(`${i.title} ${i.artist}`, { limit: 6 });
        const w = norm(i.artist);
        const hit = res.find(t => { const a = norm(t.artist); return a && (a.includes(w) || w.includes(a)); });
        return hit ? { ...hit, reason: i.reason } : null;
      } catch { return null; }
    }));
    const seen = new Set(); const songs = [];
    for (const s of found) { if (!s) continue; const k = norm(s.artist); if (seen.has(k)) continue; seen.add(k); songs.push(s); if (songs.length === 3) break; }
    // 試聴が見つからなくても、AIの候補はそのまま見せる（あとで探せる）
    for (const i of data?.ideas || []) { if (songs.length >= 3) break; const k = norm(i.artist); if (seen.has(k)) continue; seen.add(k); songs.push({ title: i.title, artist: i.artist, reason: i.reason, artwork: null, preview_url: null, track_url: null }); }
    return { songs, left: data?.left, provider: data?.provider };
  }

  // ── v8：気持ちを届ける ──
  async notifications() { return this._r(await this.sb.rpc('my_notifications', { p_limit: 60 })) || []; }
  async readNotifications() { return this._r(await this.sb.rpc('read_notifications')); }
  async sendGift(to, song, message, anonymous, postId) { return this._r(await this.sb.rpc('send_gift', { p_to: to, p_song: song, p_message: message || '', p_anonymous: !!anonymous, p_post: postId || null })); }
  async gifts() { return this._r(await this.sb.rpc('my_gifts')) || []; }
  async openGift(id) { return this._r(await this.sb.rpc('open_gift', { p_id: id })); }
  // 「聴きはじめた」をサーバーに記録。通信が不安定でも届くよう、最大3回まで送り直す
  async startListen(postId) {
    for (let i = 0; i < 3; i++) {
      try { if (fakeFail('start')) throw new Error('test'); const { error } = await this.sb.rpc('start_listen', { p_post: postId }); if (!error) return true; } catch { /* 通信失敗 */ }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
    return false;
  }
  async markListened(postId) {
    // サーバーは「聴きはじめてから14秒」を確かめる。まだなら少し待ってもう一度
    for (let i = 0; i < 3; i++) {
      if (fakeFail('mark')) throw new Error('Failed to fetch (test)');
      const r = this._r(await this.sb.rpc('mark_listened', { p_post: postId }));
      if (!r?.wait) return r;
      await new Promise(res => setTimeout(res, 2000));
    }
    throw new Error('LISTEN_WAIT');
  }
  async todayRainbow() { return this._r(await this.sb.rpc('today_rainbow')); }
  // v10：プロフィール
  async friendProfile(id) { return this._r(await this.sb.rpc('friend_profile', { p_id: id })); }
  async saveRainbow() { return this._r(await this.sb.rpc('save_rainbow')); }
  async deleteRainbow(id) { return this._r(await this.sb.rpc('delete_rainbow', { p_id: id })); }
  async sameMood(mood) { return this._r(await this.sb.rpc('same_mood', { p_mood: mood })); }
  async postWhisper(text, mood, song) { return this._r(await this.sb.rpc('post_whisper', { p_text: text, p_mood: mood || '', p_song: song || null })); }
  async nightFeed() { return this._r(await this.sb.rpc('night_feed')) || []; }
  async hugWhisper(id) { return this._r(await this.sb.rpc('hug_whisper', { p_id: id })); }
  async reportWhisper(id, reason) { return this._r(await this.sb.rpc('report_whisper', { p_id: id, p_reason: reason })); }
  async startRelay(theme, song, note) { return this._r(await this.sb.rpc('start_relay', { p_theme: theme, p_song: song, p_note: note || '' })); }
  async addRelaySong(id, song, note) { return this._r(await this.sb.rpc('add_relay_song', { p_relay: id, p_song: song, p_note: note || '' })); }
  async relays() { return this._r(await this.sb.rpc('my_relays')) || []; }
  async writeLetter(song, text, mood, days) { return this._r(await this.sb.rpc('write_letter', { p_song: song, p_text: text || '', p_mood: mood || '', p_days: days })); }
  async letters() { return this._r(await this.sb.rpc('my_letters')) || []; }
  async openNote(friend) { return this._r(await this.sb.rpc('open_note', { p_friend: friend })); }
  async addNoteEntry(friend, song, text) { return this._r(await this.sb.rpc('add_note_entry', { p_friend: friend, p_song: song, p_text: text || '' })); }
  async notes() { return this._r(await this.sb.rpc('my_notes')) || []; }
  async pairPlaylist(friend) { return this._r(await this.sb.rpc('pair_playlist', { p_friend: friend })); }
  async recap(items) {
    const { data, error } = await this.sb.functions.invoke('recommend', { body: { mode: 'recap', items } });
    if (error) { let code = ''; try { code = (await error.context.json()).error; } catch { /* */ } throw new Error(code || error.message); }
    return data;
  }

  // ── DM ──
  async threads() { return this._r(await this.sb.rpc('dm_threads')) || []; }
  async messages(peer, beforeId) {
    let q = this.sb.from('messages').select('*')
      .or(`and(sender.eq.${this.uid},receiver.eq.${peer}),and(sender.eq.${peer},receiver.eq.${this.uid})`)
      .order('id', { ascending: false }).limit(50);
    if (beforeId) q = q.lt('id', beforeId);
    return (this._r(await q) || []).reverse();
  }
  async send(peer, body, song) {
    return this._r(await this.sb.from('messages').insert({ receiver: peer, body: body || '', song: song || null }).select().single());
  }
  async markRead(peer) { return this._r(await this.sb.rpc('mark_read', { p_peer: peer })); }

  // ── push ──
  async savePush(sub, daily = true) {
    const j = sub.toJSON();
    return this._r(await this.sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, daily }));
  }
  async removePush(endpoint) { return this._r(await this.sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); }

  // ── realtime ──
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, d) { (this.handlers[ev] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } }); }
  start() {
    if (this.ch || !this.uid) return;
    const me = this.uid;
    this.ch = this.sb.channel('me-' + me)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver=eq.${me}` }, p => this.emit('message', p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender=eq.${me}` }, p => this.emit('read', p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, p => { if (p.new?.user_id !== me) this.emit('reaction', p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, p => { if (p.new?.user_id !== me) this.emit('post', p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moments' }, p => this.emit('moment', p.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` }, p => this.emit('notification', p.new))
      .subscribe(s => this.emit('status', s));
  }
  stop() { if (this.ch) { this.sb.removeChannel(this.ch); this.ch = null; } Object.values(this.typingCh).forEach(c => this.sb.removeChannel(c)); this.typingCh = {}; }
  joinTyping(peer, onTyping) {
    const key = pairKey(this.uid, peer);
    const ch = this.sb.channel('typing-' + key, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload?.from === peer) onTyping(); })
      .subscribe();
    this.typingCh[key] = ch;
    return {
      ping: () => ch.send({ type: 'broadcast', event: 'typing', payload: { from: this.uid } }),
      leave: () => { this.sb.removeChannel(ch); delete this.typingCh[key]; },
    };
  }
}

// ═════════════════════ DEMO（端末内） ═════════════════════
const DK = 'hm7_demo';
const now = () => new Date().toISOString();
const ago = m => new Date(Date.now() - m * 60000).toISOString();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));

function demoSeed() {
  const F = [
    { id: 'd-yuki', name: 'ゆーき', emoji: '🌙', avatar: null, bio: '夜の散歩と音楽', code: 'YUKI22' },
    { id: 'd-mio', name: 'みお', emoji: '🌸', avatar: null, bio: '朝はシティポップ', code: 'MIO777' },
    { id: 'd-sora', name: 'そら', emoji: '🌊', avatar: null, bio: '', code: 'SORA88' },
  ];
  const art = id => `https://is1-ssl.mzstatic.com/image/thumb/${id}/600x600bb.jpg`;
  const posts = [
    { id: uuid(), user_id: 'd-yuki', title: '夜に駆ける', artist: 'YOASOBI', artwork: null, preview_url: null, track_url: null, mood: '🥺 寂しい', comment: '帰り道にぴったり', is_public: false, created_at: ago(35), on_time: true },
    { id: uuid(), user_id: 'd-mio', title: 'Plastic Love', artist: '竹内まりや', artwork: null, preview_url: null, track_url: null, mood: '😊 嬉しい', comment: 'いい天気だった☀️', is_public: false, created_at: ago(140), on_time: false },
    { id: uuid(), user_id: 'x-1', title: 'マリーゴールド', artist: 'あいみょん', artwork: null, preview_url: null, track_url: null, mood: '😌 穏やか', comment: '', is_public: true, created_at: ago(12), on_time: true },
    { id: uuid(), user_id: 'x-2', title: '白日', artist: 'King Gnu', artwork: null, preview_url: null, track_url: null, mood: '💭 考え中', comment: 'ちょっと疲れた', is_public: true, created_at: ago(58), on_time: false },
    { id: uuid(), user_id: 'x-3', title: 'Pretender', artist: 'Official髭男dism', artwork: null, preview_url: null, track_url: null, mood: '🥺 寂しい', comment: '', is_public: true, created_at: ago(190), on_time: false },
  ];
  void art;
  return { me: null, profile: null, friends: F.slice(0, 2), people: F, posts, reactions: [], messages: [
    { id: 1, sender: 'd-yuki', receiver: 'ME', body: 'hearmeはじめたよ！よろしく🎧', song: null, created_at: ago(30), read_at: null },
  ], blocks: [], seq: 2, moment: null };
}

class DemoAPI {
  constructor() { this.live = false; this.handlers = {}; }
  load() { try { return JSON.parse(localStorage.getItem(DK)); } catch { return null; } }
  save() { try { localStorage.setItem(DK, JSON.stringify(this.db)); } catch { /* 容量 */ } }
  async init() {
    this.db = this.load() || demoSeed();
    this.save();
    return { user: this.db.me, profile: this.db.profile };
  }
  user() { return this.db.me; }
  get uid() { return this.db.me?.id; }
  pub(p) { return p && { id: p.id, name: p.name, emoji: p.emoji, avatar: p.avatar }; }
  person(id) { return id === this.uid ? this.db.profile : this.db.people.find(p => p.id === id); }
  isFriend(id) { return this.db.friends.some(f => f.id === id); }
  postJSON(p, showAuthor) {
    const rs = this.db.reactions.filter(r => r.post_id === p.id);
    const counts = {}; rs.forEach(r => counts[r.emoji] = (counts[r.emoji] || 0) + 1);
    const mine = p.user_id === this.uid;
    const anonEmo = ['🌙','🌊','🌸','⚡','🦋','🍂','☁️','🌿'][p.id.charCodeAt(2) % 8];
    const listened = (this.db.listens || []).includes(p.id);
    return { ...p, mine, has_comment: !!p.comment, comment: (mine || !p.preview_url || listened) ? p.comment : null, i_listened: listened,
      author: (showAuthor || mine) ? this.pub(this.person(p.user_id)) : { id: null, name: 'どこかの誰か', emoji: anonEmo, avatar: null },
      my_reaction: rs.find(r => r.user_id === this.uid)?.emoji || null, reactions: counts };
  }
  async signInAnon() { this.db.me = { id: 'ME', email: null, anonymous: true, providers: [] }; this.save(); return this.db.me; }
  async sendEmailCode() { return true; }
  async verifyEmailCode(email, token) {
    if (!/^\d{6}$/.test(token)) throw new Error('invalid');
    if (!this.db.me) await this.signInAnon();
    this.db.me.email = email; this.db.me.anonymous = false; this.save(); return this.db.me;
  }
  async refreshUser() { return this.db.me; }
  async google() { throw new Error('デモモードではGoogleログインは使えません'); }
  async signOut() { localStorage.removeItem(DK); this.db = demoSeed(); }
  async myProfile() { return this.db.profile; }
  async createProfile(p) { this.db.profile = { id: 'ME', code: 'HEARME', bio: '', created_at: now(), ...p }; this.db.people.push(this.db.profile); this.save(); return this.db.profile; }
  async updateProfile(p) { Object.assign(this.db.profile, p); this.save(); return this.db.profile; }
  async deleteMe() { await this.signOut(); }
  async addFriend(code) {
    code = code.toUpperCase().trim();
    if (code === this.db.profile?.code) throw new Error('SELF_CODE');
    const p = this.db.people.find(x => x.code === code);
    if (!p) throw new Error('CODE_NOT_FOUND');
    if (!this.isFriend(p.id)) this.db.friends.push(p);
    this.save(); return this.pub(p);
  }
  async removeFriend(id) { this.db.friends = this.db.friends.filter(f => f.id !== id); this.save(); }
  async friends() {
    return this.db.friends.map(f => {
      const lp = this.db.posts.filter(p => p.user_id === f.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return { ...this.pub(f), bio: f.bio, last_post: lp ? { title: lp.title, artist: lp.artist, mood: lp.mood, created_at: lp.created_at } : null };
    });
  }
  async blockUser(id) { this.db.blocks.push(id); this.db.friends = this.db.friends.filter(f => f.id !== id); this.save(); }
  async blockPostAuthor(pid) { const p = this.db.posts.find(x => x.id === pid); if (p) await this.blockUser(p.user_id); }
  async unblockAll() { this.db.blocks = []; this.save(); }
  async report() { return true; }
  sorted(a) { return a.sort((x, y) => y.created_at.localeCompare(x.created_at)); }
  async friendFeed() {
    return this.sorted(this.db.posts.filter(p => (p.user_id === this.uid || this.isFriend(p.user_id)) && !this.db.blocks.includes(p.user_id))).map(p => this.postJSON(p, true));
  }
  async publicFeed() {
    return this.sorted(this.db.posts.filter(p => p.is_public && p.user_id !== this.uid && !this.db.blocks.includes(p.user_id))).map(p => this.postJSON(p, this.isFriend(p.user_id)));
  }
  async myPosts() { return this.sorted(this.db.posts.filter(p => p.user_id === this.uid)).map(p => this.postJSON(p, true)); }
  async createPost(p) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    if (this.db.posts.filter(x => x.user_id === this.uid && new Date(x.created_at) >= start).length >= 3) throw new Error('POST_LIMIT');
    const m = this.db.moment && Date.now() - new Date(this.db.moment).getTime() < 600000;
    const row = { id: uuid(), user_id: this.uid, created_at: now(), on_time: !!m, ...p };
    this.db.posts.push(row); this.save();
    const twin = this.db.posts.find(x => x.user_id !== this.uid && this.isFriend(x.user_id) && x.title === row.title);
    if (twin) this._notify('sync', `✨ ${this.person(twin.user_id).name}とシンクロ`, `今日、ふたりとも「${row.title}」を選びました`, `/?post=${twin.id}`, { friend: twin.user_id });
    const recent = this.db.posts.filter(x => x.user_id === this.uid).slice(-3);
    if (/死にたい|消えたい|もう無理|いなくなりたい/.test(p.comment || '') || (recent.length >= 3 && recent.every(x => /^(😢|🥺|😤)/.test(x.mood)))) this._notify('care', '🌙 少しだけ、話してみない？', 'つらい時は、ひとりで抱えなくていいよ', '/?care=1');
    // デモ：フレンドが少ししてリアクション
    setTimeout(() => {
      const f = this.db.friends[0]; if (!f) return;
      this.db.reactions.push({ post_id: row.id, user_id: f.id, emoji: '❤️', created_at: now() }); this.save();
      this.emit('reaction', { post_id: row.id, user_id: f.id, emoji: '❤️' });
    }, 4000);
    return { id: row.id };
  }
  async deletePost(id) { this.db.posts = this.db.posts.filter(p => p.id !== id); this.save(); }
  async react(pid, emoji) {
    this.db.reactions = this.db.reactions.filter(r => !(r.post_id === pid && r.user_id === this.uid));
    if (emoji) this.db.reactions.push({ post_id: pid, user_id: this.uid, emoji, created_at: now() });
    this.save();
  }
  async activity() {
    return this.sorted(this.db.reactions.filter(r => r.user_id !== this.uid && this.db.posts.find(p => p.id === r.post_id && p.user_id === this.uid)).map(r => {
      const p = this.db.posts.find(x => x.id === r.post_id);
      return { emoji: r.emoji, created_at: r.created_at, post: { id: p.id, title: p.title, artist: p.artist },
        who: this.isFriend(r.user_id) ? this.pub(this.person(r.user_id)) : { name: 'どこかの誰か', emoji: '✨' } };
    }));
  }
  async todayMoment() { return this.db.moment ? { at: this.db.moment } : null; }
  async recommend(text) {
    // デモ：AIの代わりに決まった候補から選ぶ
    const { search } = await import('./music.js');
    const pool = [['夜に駆ける', 'YOASOBI', '夜の気分にそっと寄り添う'], ['マリーゴールド', 'あいみょん', 'やさしく背中を押してくれる'], ['白日', 'King Gnu', 'モヤモヤごと受け止めてくれる'], ['Pretender', 'Official髭男dism', 'せつなさに浸りたい日に'], ['水平線', 'back number', '静かに前を向ける一曲']];
    const pick = pool.sort(() => Math.random() - .5).slice(0, 3);
    const songs = [];
    for (const [t, a, reason] of pick) { const [s] = await search(`${t} ${a}`, { limit: 3 }).catch(() => []); if (s) songs.push({ ...s, reason }); }
    void text; return { songs, left: 9, provider: 'demo' };
  }
  // v8 デモ実装（端末内）
  _v8() { const d = this.db; d.notifs ||= []; d.gifts ||= []; d.listens ||= []; d.whispers ||= []; d.relays ||= []; d.letters ||= []; d.notes ||= {}; d.nseq ||= 1; return d; }
  _notify(kind, title, body, url, data = {}) { const d = this._v8(); const n = { id: d.nseq++, user_id: this.uid, kind, title, body, url, data, created_at: now(), read_at: null }; d.notifs.unshift(n); this.save(); this.emit('notification', n); }
  async notifications() {
    const d = this._v8(); const today = new Date().toDateString();
    const y = this.db.posts.find(p => p.user_id === 'd-yuki');
    if (y && this.isFriend('d-yuki') && !d.notifs.some(n => n.kind === 'rain' && new Date(n.created_at).toDateString() === today)) {
      d.notifs.push({ id: d.nseq++, kind: 'rain', title: '🌧 ゆーきの空が、雨みたい', body: '寄り添う1曲を贈る？', url: `/?giftto=d-yuki&post=${y.id}`, data: { friend: 'd-yuki', post: y.id }, created_at: now(), read_at: null });
      this.save();
    }
    return d.notifs.slice(0, 60);
  }
  async readNotifications() { this._v8().notifs.forEach(n => n.read_at ||= now()); this.save(); }
  async sendGift(to, song, message, anonymous) {
    const d = this._v8(); if (!this.isFriend(to)) throw new Error('NOT_ALLOWED');
    d.gifts.unshift({ id: uuid(), song, message, anonymous, created_at: now(), opened_at: null, received: false, from: this.pub(this.db.profile), to: this.pub(this.person(to)) }); this.save();
    setTimeout(() => { const f = this.person(to); d.gifts.unshift({ id: uuid(), song: { title: '水平線', artist: 'back number' }, message: 'お返し！', anonymous: false, created_at: now(), opened_at: null, received: true, from: this.pub(f), to: this.pub(this.db.profile) }); this.save(); this._notify('gift', `🎁 ${f.name}が曲を贈ってくれました`, '「水平線」 — お返し！', '/?gift=demo'); }, 5000);
    return { id: 'ok' };
  }
  async gifts() { return this._v8().gifts; }
  async openGift(id) { const g = this._v8().gifts.find(x => x.id === id); if (g) g.opened_at ||= now(); this.save(); }
  async startListen() { return true; }
  async markListened(postId) { const d = this._v8(); if (!d.listens.includes(postId)) { d.listens.push(postId); this.save(); } return { comment: this.db.posts.find(p => p.id === postId)?.comment ?? null }; }
  async friendProfile(id) {
    const p = this.person(id); if (!p) throw new Error('NOT_FOUND');
    const posts = this.sorted(this.db.posts.filter(x => x.user_id === id)).map(x => this.postJSON(x, true));
    this.db.rainbows ||= [];
    const demoFav = { 'd-yuki': [['夜に駆ける', 'YOASOBI'], ['白日', 'King Gnu'], ['水平線', 'back number']], 'd-mio': [['Plastic Love', '竹内まりや'], ['マリーゴールド', 'あいみょん']] }[id];
    const demoRb = id !== this.uid && !this.db.rainbows.some(r => r.user_id === id) ? [
      { id: id + '-r1', day: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), data: { total: 3, moods: [{ e: '😊', n: 1 }, { e: '😌', n: 1 }, { e: '🥰', n: 1 }] } },
      { id: id + '-r2', day: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), data: { total: 4, moods: [{ e: '🔥', n: 1 }, { e: '😢', n: 2 }, { e: '🥺', n: 1 }] } }] : [];
    return { id: p.id, name: p.name, emoji: p.emoji, avatar: p.avatar, bio: p.bio || '',
      fav_songs: p.fav_songs || (demoFav || []).map(([title, artist]) => ({ title, artist })),
      friends: id === this.uid ? this.db.friends.length : 2, days: new Set(posts.map(x => x.created_at.slice(0, 10))).size, posts,
      rainbows: [...this.db.rainbows.filter(r => r.user_id === id).sort((a, b) => b.day.localeCompare(a.day)), ...demoRb] };
  }
  async saveRainbow() {
    const r = await this.todayRainbow(); if (!r.moods.length) throw new Error('EMPTY_RAINBOW');
    const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.db.rainbows ||= []; this.db.rainbows = this.db.rainbows.filter(x => !(x.user_id === this.uid && x.day === day));
    const row = { id: 'rb' + Date.now(), user_id: this.uid, day, data: { total: r.total, moods: r.moods.map(m => ({ e: m.e, n: m.n })) } };
    this.db.rainbows.push(row); this.save(); return row;
  }
  async deleteRainbow(id) { this.db.rainbows = (this.db.rainbows || []).filter(r => r.id !== id); this.save(); }
  async todayRainbow() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const ids = [this.uid, ...this.db.friends.map(f => f.id)];
    const latest = {};
    this.sorted([...this.db.posts]).reverse().forEach(p => { if (ids.includes(p.user_id) && new Date(p.created_at) >= start) latest[p.user_id] = p; });
    const g = {};
    Object.values(latest).forEach(p => { const e = (p.mood || '').split(' ')[0]; (g[e] ||= { e, n: 0, names: [], ids: [] }); g[e].n++; g[e].names.push(p.user_id === this.uid ? 'あなた' : this.person(p.user_id)?.name); g[e].ids.push(p.user_id); });
    return { total: ids.length, waiting: ids.length - Object.keys(latest).length, me: latest[this.uid] ? latest[this.uid].mood.split(' ')[0] : null, moods: Object.values(g) };
  }
  async sameMood(mood) {
    const e = (mood || '').split(' ')[0];
    const songs = this.db.posts.filter(p => p.is_public && p.user_id !== this.uid && (p.mood || '').startsWith(e)).map(p => ({ title: p.title, artist: p.artist, artwork: p.artwork, preview_url: p.preview_url, track_url: p.track_url }));
    return { count: 3 + songs.length, songs: songs.length ? songs : this.db.posts.filter(p => p.is_public).slice(0, 3).map(p => ({ title: p.title, artist: p.artist, artwork: p.artwork, preview_url: p.preview_url })) };
  }
  async postWhisper(text, mood, song) { const d = this._v8(); d.whispers.unshift({ id: uuid(), text, mood, song, created_at: now(), mine: true, emoji: '🌙', hugs: 0 }); this.save(); return { id: 'w' }; }
  async nightFeed() {
    const d = this._v8();
    if (!d.whispers.some(w => !w.mine)) d.whispers.push({ id: uuid(), text: '明日のテスト、こわいな', mood: '🥺 寂しい', song: null, created_at: ago(20), mine: false, emoji: '🌊' }, { id: uuid(), text: 'この曲で眠れそう', mood: '😌 穏やか', song: { title: 'Lemon', artist: '米津玄師' }, created_at: ago(55), mine: false, emoji: '⭐' });
    return d.whispers;
  }
  async hugWhisper(id) { const w = this._v8().whispers.find(x => x.id === id); if (w) w.hugged = true; this.save(); }
  async reportWhisper() { return true; }
  async startRelay(theme, song, note) { const d = this._v8(); const r = { id: uuid(), theme, created_at: now(), ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), creator: this.pub(this.db.profile), songs: [{ id: 1, song, note, mine: true, by: this.pub(this.db.profile), created_at: now() }] }; d.relays.unshift(r); this.save(); return { id: r.id }; }
  async addRelaySong(id, song, note) { const r = this._v8().relays.find(x => x.id === id); if (!r) throw new Error('NOT_ALLOWED'); if (r.songs[r.songs.length - 1]?.mine) throw new Error('RELAY_TWICE'); r.songs.push({ id: r.songs.length + 1, song, note, mine: true, by: this.pub(this.db.profile), created_at: now() }); this.save(); }
  async relays() {
    const d = this._v8();
    if (!d.relays.some(r => !r.creator || r.creator.id !== this.uid)) {
      const f = this.db.friends[0];
      if (f) d.relays.push({ id: 'demo-relay', theme: '雨の日に聴きたい曲', created_at: ago(300), ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), creator: this.pub(f), songs: [{ id: 1, song: { title: '傘', artist: 'King Gnu' }, note: 'はじまり', mine: false, by: this.pub(f), created_at: ago(300) }] });
    }
    return d.relays;
  }
  async writeLetter(song, text, mood, days) { const d = this._v8(); const l = { id: uuid(), created_at: now(), deliver_at: new Date(Date.now() + days * 864e5).toISOString(), delivered_at: null, _song: song, _text: text, _mood: mood }; d.letters.unshift(l); this.save(); return { id: l.id, deliver_at: l.deliver_at }; }
  async letters() { return this._v8().letters.map(l => ({ ...l, song: l.delivered_at ? l._song : null, text: l.delivered_at ? l._text : null })); }
  async openNote(friend) { const d = this._v8(); d.notes[friend] ||= { id: 'n-' + friend, created_at: now(), entries: [{ id: 1, song: { title: 'Plastic Love', artist: '竹内まりや' }, text: '今日はこれ！', day: new Date(Date.now() - 864e5).toISOString().slice(0, 10), mine: false, created_at: ago(1500) }] }; this.save(); return d.notes[friend]; }
  async addNoteEntry(friend, song, text) { const n = await this.openNote(friend); const day = new Date().toISOString().slice(0, 10); n.entries = n.entries.filter(e => !(e.mine && e.day === day)); n.entries.unshift({ id: Date.now(), song, text, day, mine: true, created_at: now() }); this.save(); }
  async notes() { const d = this._v8(); return Object.entries(d.notes).map(([fid, n]) => ({ id: n.id, friend: this.pub(this.person(fid)), days: new Set(n.entries.map(e => e.day)).size, last: n.entries[0]?.created_at, today_me: n.entries.some(e => e.mine && e.day === new Date().toISOString().slice(0, 10)), today_them: false })); }
  async pairPlaylist(friend) { return { since: ago(60 * 24 * 30), songs: this.db.posts.filter(p => p.user_id === this.uid || p.user_id === friend).map(p => ({ title: p.title, artist: p.artist, artwork: p.artwork, preview_url: p.preview_url, mine: p.user_id === this.uid, from: 'post', mood: p.mood })) }; }
  async recap(items) { void items; return { title: '雨のち、少し晴れ', summary: '月のはじめは静かな曲が多かったけれど、後半は明るい曲が増えてきました。ちゃんと自分の気持ちに寄り添えていた1ヶ月です。', word: '来月も、好きな曲と一緒に。' }; }
  fireMoment() { this.db.moment = now(); this.save(); this.emit('moment', { at: this.db.moment }); }
  pairMsgs(peer) { return this.db.messages.filter(m => (m.sender === this.uid && m.receiver === peer) || (m.sender === peer && m.receiver === this.uid)); }
  async threads() {
    return this.db.friends.map(f => {
      const ms = this.pairMsgs(f.id); const l = ms[ms.length - 1];
      return { peer: this.pub(f), last: l ? { body: l.body, song: !!l.song, created_at: l.created_at, mine: l.sender === this.uid } : null,
        unread: ms.filter(m => m.sender === f.id && !m.read_at).length };
    }).sort((a, b) => (b.last?.created_at || '').localeCompare(a.last?.created_at || ''));
  }
  async messages(peer) { return this.pairMsgs(peer).slice(-50); }
  async send(peer, body, song) {
    if (!this.isFriend(peer)) throw new Error('row-level security');
    const m = { id: this.db.seq++, sender: this.uid, receiver: peer, body: body || '', song: song || null, created_at: now(), read_at: null };
    this.db.messages.push(m); this.save();
    // デモ：既読→入力中→返信
    setTimeout(() => { m.read_at = now(); this.save(); this.emit('read', m); }, 1200);
    if (!song?.reaction) {
      setTimeout(() => this.emit('typing:' + peer), 1800);
      setTimeout(() => {
        const replies = song ? ['この曲いいね！聴いてみる🎧', 'わかる〜この曲好き', 'センスいい✨'] : ['うんうん', 'それな〜🎵', 'わかる！', '今度おすすめ教えて！'];
        const r = { id: this.db.seq++, sender: peer, receiver: this.uid, body: replies[Math.random() * replies.length | 0], song: null, created_at: now(), read_at: null };
        this.db.messages.push(r); this.save(); this.emit('message', r);
      }, 3600);
    }
    return m;
  }
  async markRead(peer) { this.pairMsgs(peer).forEach(m => { if (m.sender === peer && !m.read_at) m.read_at = now(); }); this.save(); }
  async savePush() { return true; }
  async removePush() { return true; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, d) { (this.handlers[ev] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } }); }
  start() { this.emit('status', 'SUBSCRIBED'); }
  stop() {}
  joinTyping(peer, onTyping) {
    const fn = () => onTyping();
    this.on('typing:' + peer, fn);
    return { ping() {}, leave: () => { this.handlers['typing:' + peer] = (this.handlers['typing:' + peer] || []).filter(f => f !== fn); } };
  }
}

export const api = LIVE ? new LiveAPI() : new DemoAPI();

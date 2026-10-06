// hearme data layer — Supabase（本番）とデモ（端末内）の2実装、同じインターフェース
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const LIVE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const ERR = {
  POST_LIMIT: '今日はもう3回投稿しました。また明日！',
  CODE_NOT_FOUND: 'コードが見つかりません',
  SELF_CODE: '自分のコードは追加できません',
  NOT_ALLOWED: 'この操作はできません',
  NOT_SIGNED_IN: 'ログインし直してください',
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
  async myProfile() {
    return this._r(await this.sb.from('profiles').select('*').eq('id', this.uid).maybeSingle());
  }
  async createProfile(p) {
    return this._r(await this.sb.from('profiles').upsert({ id: this.uid, ...p }).select().single());
  }
  async updateProfile(p) {
    return this._r(await this.sb.from('profiles').update(p).eq('id', this.uid).select().single());
  }
  async deleteMe() { this._r(await this.sb.rpc('delete_me')); await this.signOut(); }

  // ── friends ──
  async addFriend(code) { return this._r(await this.sb.rpc('add_friend', { p_code: code })); }
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
    { id: uuid(), user_id: 'd-yuki', title: '夜に駆ける', artist: 'YOASOBI', artwork: null, preview_url: null, track_url: null, mood: '🌙 しんみり', comment: '帰り道にぴったり', is_public: false, created_at: ago(35), on_time: true },
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
    return { ...p, mine,
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

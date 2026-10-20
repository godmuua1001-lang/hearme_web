-- ═══════════════════════════════════════════════════════════════
-- hearme v8 — 「気持ちを届ける」機能の土台（15機能分）
-- schema.sql / ai.sql / security.sql / push-setup の後に、SQL Editor で Run
-- 何度実行してもOK
-- ═══════════════════════════════════════════════════════════════

-- ───────── 共通：気分の分類 ─────────
create or replace function public.mood_tone(m text) returns int
language sql immutable as $$
  -- 1=明るい 0=おだやか -1=しずんでる
  select case
    when m like '😊%' or m like '🤩%' or m like '🔥%' or m like '🥰%' then 1
    when m like '😢%' or m like '🥺%' or m like '😤%' then -1
    else 0 end;
$$;

-- ⑧ 気分のグラデーション（2軸：x=しずか↔元気, y=さみしい↔あかるい）
alter table public.posts add column if not exists mood_x smallint check (mood_x between -100 and 100);
alter table public.posts add column if not exists mood_y smallint check (mood_y between -100 and 100);

-- ═════════ 通知（アプリ内＋プッシュ） ═════════
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  url        text not null default '/',
  data       jsonb not null default '{}'::jsonb,
  push       boolean not null default true,
  dedupe     text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id, id desc);
create unique index if not exists notifications_dedupe_idx on public.notifications(user_id, dedupe) where dedupe is not null;
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
drop policy if exists "notifications own" on public.notifications;
create policy "notifications own" on public.notifications for select to authenticated using (user_id = auth.uid());

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_url text,
                                         p_data jsonb default '{}'::jsonb, p_push boolean default true, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, kind, title, body, url, data, push, dedupe)
  values (p_user, p_kind, left(p_title, 80), left(p_body, 160), p_url, p_data, p_push, p_dedupe)
  on conflict (user_id, dedupe) where dedupe is not null do nothing;
end $$;

-- プッシュ送信（push-setup.sql の call_push があれば使う）
create or replace function public.tg_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.push and to_regprocedure('public.call_push(jsonb)') is not null then
    execute 'select public.call_push($1)' using jsonb_build_object('kind', 'notify', 'record', to_jsonb(new));
  end if;
  return new;
end $$;
drop trigger if exists notification_push on public.notifications;
create trigger notification_push after insert on public.notifications for each row execute function public.tg_notification_push();

create or replace function public.my_notifications(p_limit int default 50) returns setof notifications
language sql stable security definer set search_path = public as $$
  select * from notifications where user_id = auth.uid() order by id desc limit least(p_limit, 100);
$$;
create or replace function public.read_notifications() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- 曲データの形チェック
create or replace function public.valid_song(s jsonb) returns boolean
language sql immutable as $$
  select s is not null and jsonb_typeof(s) = 'object' and pg_column_size(s) < 2000
     and coalesce(s->>'title', '') <> ''
     and (s->>'artwork' is null or s->>'artwork' ~ '^https://is[0-9]+-ssl\.mzstatic\.com/')
     and (s->>'preview_url' is null or s->>'preview_url' ~ '^https://audio-ssl\.itunes\.apple\.com/');
$$;

-- ═════════ ① 曲を贈る ═════════
create table if not exists public.gifts (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null references public.profiles(id) on delete cascade,
  receiver   uuid not null references public.profiles(id) on delete cascade,
  song       jsonb not null check (public.valid_song(song)),
  message    text not null default '' check (char_length(message) <= 60),
  anonymous  boolean not null default false,
  post_id    uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  opened_at  timestamptz
);
create index if not exists gifts_receiver_idx on public.gifts(receiver, created_at desc);
alter table public.gifts enable row level security;   -- 直接は読めない（匿名を守るため RPC 経由）

create or replace function public.send_gift(p_to uuid, p_song jsonb, p_message text, p_anonymous boolean, p_post uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g gifts; sname text; semoji text;
begin
  if me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.are_friends(me, p_to) or public.is_blocked(me, p_to) then raise exception 'NOT_ALLOWED'; end if;
  if (select count(*) from gifts where sender = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'GIFT_LIMIT' using hint = '今日はもうたくさん贈りました';
  end if;
  insert into gifts(sender, receiver, song, message, anonymous, post_id)
  values (me, p_to, p_song, left(coalesce(p_message, ''), 60), coalesce(p_anonymous, false), p_post) returning * into g;
  select name, emoji into sname, semoji from profiles where id = me;
  perform public.notify(p_to, 'gift',
    case when g.anonymous then '🎁 誰かが曲を贈ってくれました' else '🎁 ' || sname || 'が曲を贈ってくれました' end,
    '「' || (p_song->>'title') || '」' || case when g.message <> '' then ' — ' || g.message else '' end,
    '/?gift=' || g.id, jsonb_build_object('gift_id', g.id));
  return json_build_object('id', g.id);
end $$;

create or replace function public.my_gifts() returns setof json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', g.id, 'song', g.song, 'message', g.message, 'anonymous', g.anonymous,
    'created_at', g.created_at, 'opened_at', g.opened_at, 'received', g.receiver = auth.uid(),
    'from', case when g.receiver = auth.uid() and g.anonymous then null
                 else (select json_build_object('id', p.id, 'name', p.name, 'emoji', p.emoji, 'avatar', p.avatar) from profiles p where p.id = g.sender) end,
    'to', (select json_build_object('id', p.id, 'name', p.name, 'emoji', p.emoji, 'avatar', p.avatar) from profiles p where p.id = g.receiver))
  from gifts g
  where (g.receiver = auth.uid() and not public.is_blocked(g.receiver, g.sender)) or g.sender = auth.uid()
  order by g.created_at desc limit 60;
$$;

create or replace function public.open_gift(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g gifts;
begin
  update gifts set opened_at = now() where id = p_id and receiver = auth.uid() and opened_at is null returning * into g;
  if g.id is not null then
    perform public.notify(g.sender, 'gift_opened', '💌 贈った曲が届きました',
      '「' || (g.song->>'title') || '」を受け取ってくれたよ', '/?tab=me', '{}'::jsonb, false);
  end if;
end $$;

-- ═════════ ② 聴いてくれたよ ═════════
create table if not exists public.listens (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.listens enable row level security;

create or replace function public.mark_listened(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p posts; n int; who text;
begin
  select * into p from posts where id = p_post;
  if p.id is null or p.user_id = me or not public.can_see_post(p_post) then return; end if;
  insert into listens(post_id, user_id) values (p_post, me) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return; end if;
  who := case when public.are_friends(me, p.user_id) then (select name from profiles where id = me) else 'どこかの誰か' end;
  perform public.notify(p.user_id, 'listened', '🎧 ' || who || 'があなたの曲を聴いてくれたよ',
    '「' || p.title || '」', '/?post=' || p.id, jsonb_build_object('post_id', p.id), false);
end $$;

-- ═════════ ⑤ 数字のないSNS：リアクション数・聴かれた数は本人にだけ ═════════
create or replace function public._post_json(p posts, show_author boolean) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'artist', p.artist, 'artwork', p.artwork,
    'preview_url', p.preview_url, 'track_url', p.track_url, 'track_id', p.track_id,
    'mood', p.mood, 'mood_x', p.mood_x, 'mood_y', p.mood_y, 'comment', p.comment,
    'is_public', p.is_public, 'created_at', p.created_at, 'on_time', p.on_time,
    'mine', p.user_id = auth.uid(),
    'author', case when show_author or p.user_id = auth.uid() then
        (select json_build_object('id', pr.id, 'name', pr.name, 'emoji', pr.emoji, 'avatar', pr.avatar)
           from profiles pr where pr.id = p.user_id)
      else json_build_object('id', null, 'name', 'どこかの誰か',
             'emoji', (array['🌙','🌊','🌸','⚡','🦋','🍂','☁️','🌿'])[1 + abs(hashtext(p.id::text)) % 8],
             'avatar', null) end,
    'my_reaction', (select r.emoji from reactions r where r.post_id = p.id and r.user_id = auth.uid()),
    'reactions', case when p.user_id = auth.uid() then coalesce((select json_object_agg(emoji, n) from
        (select emoji, count(*) n from reactions r where r.post_id = p.id group by emoji) t), '{}'::json) else '{}'::json end,
    'listened', case when p.user_id = auth.uid() then (select count(*) from listens l where l.post_id = p.id) else null end,
    'i_listened', exists (select 1 from listens l where l.post_id = p.id and l.user_id = auth.uid())
  );
$$;
revoke all on function public._post_json(public.posts, boolean) from public, anon, authenticated;

-- ═════════ ③ 同じ気持ちの人 ═════════
create or replace function public.same_mood(p_mood text) returns json
language sql stable security definer set search_path = public as $$
  with today as (
    select * from posts
    where created_at >= date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
      and split_part(mood, ' ', 1) = split_part(p_mood, ' ', 1)
      and user_id <> auth.uid()
      and not public.is_blocked(auth.uid(), user_id)
  )
  select json_build_object(
    'count', (select count(distinct user_id) from today),
    'songs', coalesce((select json_agg(x) from (
        select json_build_object('title', title, 'artist', artist, 'artwork', artwork, 'preview_url', preview_url, 'track_url', track_url) x
        from today where is_public order by random() limit 12) s), '[]'::json));
$$;

-- ═════════ ⑥ 夜だけのひとりごと（22時〜朝6時・匿名・朝に消える） ═════════
create table if not exists public.whispers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 80),
  mood       text not null default '' check (char_length(mood) <= 20),
  song       jsonb check (song is null or public.valid_song(song)),
  created_at timestamptz not null default now()
);
create table if not exists public.whisper_hugs (
  whisper_id uuid not null references public.whispers(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (whisper_id, user_id)
);
alter table public.whispers enable row level security;
alter table public.whisper_hugs enable row level security;

create or replace function public.is_night() returns boolean
language sql stable as $$
  select extract(hour from now() at time zone 'Asia/Tokyo') >= 22 or extract(hour from now() at time zone 'Asia/Tokyo') < 6;
$$;
create or replace function public.post_whisper(p_text text, p_mood text, p_song jsonb default null) returns json
language plpgsql security definer set search_path = public as $$
declare w whispers;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.is_night() then raise exception 'NOT_NIGHT' using hint = 'ひとりごとは22時〜朝6時だけ'; end if;
  if (select count(*) from whispers where user_id = auth.uid() and created_at > now() - interval '8 hours') >= 5 then
    raise exception 'WHISPER_LIMIT' using hint = '今夜はもう5回つぶやきました';
  end if;
  insert into whispers(user_id, text, mood, song) values (auth.uid(), trim(p_text), coalesce(p_mood, ''), p_song) returning * into w;
  return json_build_object('id', w.id);
end $$;
create or replace function public.night_feed() returns setof json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', w.id, 'text', w.text, 'mood', w.mood, 'song', w.song, 'created_at', w.created_at,
    'mine', w.user_id = auth.uid(),
    'emoji', (array['🌙','🌊','🌸','⚡','🦋','🍂','☁️','🌿','⭐','🕯'])[1 + abs(hashtext(w.id::text)) % 10],
    'hugged', exists (select 1 from whisper_hugs h where h.whisper_id = w.id and h.user_id = auth.uid()),
    'hugs', case when w.user_id = auth.uid() then (select count(*) from whisper_hugs h where h.whisper_id = w.id) else null end)
  from whispers w
  where public.is_night() and not public.is_blocked(auth.uid(), w.user_id)
  order by w.created_at desc limit 80;
$$;
create or replace function public.hug_whisper(p_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into whisper_hugs(whisper_id, user_id) select p_id, auth.uid() where public.is_night() on conflict do nothing;
$$;
create or replace function public.report_whisper(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from whispers where id = p_id;
  insert into reports(reporter, target_user, reason) values (auth.uid(), uid, left('[ひとりごと] ' || coalesce(p_reason, ''), 200));
end $$;
create or replace function public.clear_whispers() returns void
language sql security definer set search_path = public as $$ delete from whispers; $$;

-- ═════════ ⑦ 曲リレー ═════════
create table if not exists public.relays (
  id         uuid primary key default gen_random_uuid(),
  creator    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  theme      text not null check (char_length(theme) between 1 and 30),
  created_at timestamptz not null default now(),
  ends_at    timestamptz not null default now() + interval '7 days'
);
create table if not exists public.relay_songs (
  id         bigint generated always as identity primary key,
  relay_id   uuid not null references public.relays(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  song       jsonb not null check (public.valid_song(song)),
  note       text not null default '' check (char_length(note) <= 40),
  created_at timestamptz not null default now()
);
alter table public.relays enable row level security;
alter table public.relay_songs enable row level security;

create or replace function public.can_see_relay(p_relay uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from relays r where r.id = p_relay
    and (r.creator = auth.uid() or (public.are_friends(auth.uid(), r.creator) and not public.is_blocked(auth.uid(), r.creator))));
$$;
create or replace function public.start_relay(p_theme text, p_song jsonb, p_note text default '') returns json
language plpgsql security definer set search_path = public as $$
declare r relays;
begin
  if (select count(*) from relays where creator = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'RELAY_LIMIT' using hint = 'リレーは1日3つまで';
  end if;
  insert into relays(creator, theme) values (auth.uid(), trim(p_theme)) returning * into r;
  insert into relay_songs(relay_id, user_id, song, note) values (r.id, auth.uid(), p_song, left(coalesce(p_note, ''), 40));
  -- フレンドに知らせる
  perform public.notify(case when f.user_a = auth.uid() then f.user_b else f.user_a end, 'relay',
            '🔗 曲リレーが始まりました', '「' || r.theme || '」次の1曲をつなごう', '/?relay=' || r.id, '{}'::jsonb, true, 'relay:' || r.id)
    from friendships f where auth.uid() in (f.user_a, f.user_b);
  return json_build_object('id', r.id);
end $$;
create or replace function public.add_relay_song(p_relay uuid, p_song jsonb, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare last_user uuid; r relays; n int;
begin
  select * into r from relays where id = p_relay;
  if r.id is null or not public.can_see_relay(p_relay) then raise exception 'NOT_ALLOWED'; end if;
  if r.ends_at < now() then raise exception 'RELAY_ENDED' using hint = 'このリレーは終わりました'; end if;
  select user_id into last_user from relay_songs where relay_id = p_relay order by id desc limit 1;
  if last_user = auth.uid() then raise exception 'RELAY_TWICE' using hint = '連続ではつなげません。誰かが次をつなぐのを待ってね'; end if;
  select count(*) into n from relay_songs where relay_id = p_relay;
  if n >= 30 then raise exception 'RELAY_FULL' using hint = 'このリレーは30曲で完成しました'; end if;
  insert into relay_songs(relay_id, user_id, song, note) values (p_relay, auth.uid(), p_song, left(coalesce(p_note, ''), 40));
  if r.creator <> auth.uid() then
    perform public.notify(r.creator, 'relay', '🔗 リレーに曲がつながりました', '「' || r.theme || '」に「' || (p_song->>'title') || '」', '/?relay=' || r.id, '{}'::jsonb, false);
  end if;
end $$;
create or replace function public.my_relays() returns setof json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', r.id, 'theme', r.theme, 'created_at', r.created_at, 'ends_at', r.ends_at,
    'creator', (select json_build_object('id', p.id, 'name', p.name, 'emoji', p.emoji, 'avatar', p.avatar) from profiles p where p.id = r.creator),
    'songs', coalesce((select json_agg(json_build_object('id', s.id, 'song', s.song, 'note', s.note, 'created_at', s.created_at, 'mine', s.user_id = auth.uid(),
        'by', case when s.user_id = auth.uid() or public.are_friends(auth.uid(), s.user_id)
                   then (select json_build_object('name', p.name, 'emoji', p.emoji, 'avatar', p.avatar) from profiles p where p.id = s.user_id)
                   else json_build_object('name', 'フレンドのフレンド', 'emoji', '🔗', 'avatar', null) end) order by s.id)
        from relay_songs s where s.relay_id = r.id and not public.is_blocked(auth.uid(), s.user_id)), '[]'::json))
  from relays r
  where public.can_see_relay(r.id) and r.created_at > now() - interval '30 days'
  order by r.created_at desc limit 20;
$$;

-- ═════════ ⑩ 未来の自分へ ═════════
create table if not exists public.letters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  song         jsonb not null check (public.valid_song(song)),
  text         text not null default '' check (char_length(text) <= 140),
  mood         text not null default '' check (char_length(mood) <= 20),
  created_at   timestamptz not null default now(),
  deliver_at   timestamptz not null,
  delivered_at timestamptz,
  check (deliver_at > created_at)
);
alter table public.letters enable row level security;
create or replace function public.write_letter(p_song jsonb, p_text text, p_mood text, p_days int) returns json
language plpgsql security definer set search_path = public as $$
declare l letters;
begin
  if p_days not in (7, 30, 100, 365) then raise exception 'NOT_ALLOWED'; end if;
  if (select count(*) from letters where user_id = auth.uid() and delivered_at is null) >= 20 then
    raise exception 'LETTER_LIMIT' using hint = '届く前の手紙は20通まで';
  end if;
  insert into letters(user_id, song, text, mood, deliver_at)
  values (auth.uid(), p_song, left(coalesce(p_text, ''), 140), coalesce(p_mood, ''), now() + make_interval(days => p_days)) returning * into l;
  return json_build_object('id', l.id, 'deliver_at', l.deliver_at);
end $$;
create or replace function public.my_letters() returns setof json
language sql stable security definer set search_path = public as $$
  -- 届く前は中身を見せない（タイムカプセル）
  select json_build_object('id', id, 'created_at', created_at, 'deliver_at', deliver_at, 'delivered_at', delivered_at,
    'song', case when delivered_at is not null then song else null end,
    'text', case when delivered_at is not null then text else null end,
    'mood', case when delivered_at is not null then mood else null end)
  from letters where user_id = auth.uid() order by deliver_at desc limit 50;
$$;
create or replace function public.deliver_letters() returns void
language plpgsql security definer set search_path = public as $$
declare l letters;
begin
  for l in update letters set delivered_at = now() where delivered_at is null and deliver_at <= now() returning * loop
    perform public.notify(l.user_id, 'letter', '💌 過去のあなたから曲が届きました',
      to_char(l.created_at at time zone 'Asia/Tokyo', 'FMMM月FMDD日') || 'のあなたより「' || (l.song->>'title') || '」', '/?letter=' || l.id);
  end loop;
end $$;

-- ═════════ ⑪ 2人だけの交換ノート ═════════
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);
create table if not exists public.note_entries (
  id         bigint generated always as identity primary key,
  note_id    uuid not null references public.notes(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  song       jsonb not null check (public.valid_song(song)),
  text       text not null default '' check (char_length(text) <= 60),
  day        date not null default (now() at time zone 'Asia/Tokyo')::date,
  created_at timestamptz not null default now(),
  unique (note_id, user_id, day)
);
alter table public.notes enable row level security;
alter table public.note_entries enable row level security;
create or replace function public.open_note(p_friend uuid) returns json
language plpgsql security definer set search_path = public as $$
declare n notes;
begin
  if not public.are_friends(auth.uid(), p_friend) or public.is_blocked(auth.uid(), p_friend) then raise exception 'NOT_ALLOWED'; end if;
  insert into notes(user_a, user_b) values (least(auth.uid(), p_friend), greatest(auth.uid(), p_friend))
    on conflict (user_a, user_b) do nothing;
  select * into n from notes where user_a = least(auth.uid(), p_friend) and user_b = greatest(auth.uid(), p_friend);
  return json_build_object('id', n.id, 'created_at', n.created_at,
    'entries', coalesce((select json_agg(json_build_object('id', e.id, 'song', e.song, 'text', e.text, 'day', e.day,
        'created_at', e.created_at, 'mine', e.user_id = auth.uid()) order by e.day desc, e.id desc)
      from note_entries e where e.note_id = n.id), '[]'::json));
end $$;
create or replace function public.add_note_entry(p_friend uuid, p_song jsonb, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare n notes; me text;
begin
  select * into n from notes where user_a = least(auth.uid(), p_friend) and user_b = greatest(auth.uid(), p_friend);
  if n.id is null or not public.are_friends(auth.uid(), p_friend) then raise exception 'NOT_ALLOWED'; end if;
  insert into note_entries(note_id, user_id, song, text) values (n.id, auth.uid(), p_song, left(coalesce(p_text, ''), 60))
  on conflict (note_id, user_id, day) do update set song = excluded.song, text = excluded.text, created_at = now();
  select name into me from profiles where id = auth.uid();
  perform public.notify(p_friend, 'note', '📓 ' || me || 'が交換ノートに書きました', '「' || (p_song->>'title') || '」',
    '/?note=' || auth.uid(), '{}'::jsonb, true, 'note:' || n.id || ':' || auth.uid() || ':' || (now() at time zone 'Asia/Tokyo')::date);
end $$;
create or replace function public.my_notes() returns setof json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', n.id,
    'friend', (select json_build_object('id', p.id, 'name', p.name, 'emoji', p.emoji, 'avatar', p.avatar) from profiles p
               where p.id = case when n.user_a = auth.uid() then n.user_b else n.user_a end),
    'days', (select count(distinct day) from note_entries e where e.note_id = n.id),
    'last', (select max(created_at) from note_entries e where e.note_id = n.id),
    'today_me', exists (select 1 from note_entries e where e.note_id = n.id and e.user_id = auth.uid() and e.day = (now() at time zone 'Asia/Tokyo')::date),
    'today_them', exists (select 1 from note_entries e where e.note_id = n.id and e.user_id <> auth.uid() and e.day = (now() at time zone 'Asia/Tokyo')::date))
  from notes n where auth.uid() in (n.user_a, n.user_b)
    and public.are_friends(n.user_a, n.user_b)
  order by (select max(created_at) from note_entries e where e.note_id = n.id) desc nulls last;
$$;

-- ═════════ ⑭ フレンドの記念日 ＆ 2人のプレイリスト ═════════
create or replace function public.anniversaries() returns void
language plpgsql security definer set search_path = public as $$
declare f record; d int; label text; na text; nb text;
begin
  for f in select * from friendships loop
    d := ((now() at time zone 'Asia/Tokyo')::date - (f.created_at at time zone 'Asia/Tokyo')::date);
    label := case d when 30 then '1ヶ月' when 100 then '100日' when 365 then '1年' when 730 then '2年' else null end;
    continue when label is null;
    select name into na from profiles where id = f.user_a;
    select name into nb from profiles where id = f.user_b;
    perform public.notify(f.user_a, 'anniversary', '🎂 ' || nb || 'とつながって' || label, '2人のプレイリストができました', '/?pair=' || f.user_b, '{}'::jsonb, true, 'anniv:' || f.user_b || ':' || d);
    perform public.notify(f.user_b, 'anniversary', '🎂 ' || na || 'とつながって' || label, '2人のプレイリストができました', '/?pair=' || f.user_a, '{}'::jsonb, true, 'anniv:' || f.user_a || ':' || d);
  end loop;
end $$;
create or replace function public.pair_playlist(p_friend uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when not public.are_friends(auth.uid(), p_friend) then null else json_build_object(
    'since', (select created_at from friendships where user_a = least(auth.uid(), p_friend) and user_b = greatest(auth.uid(), p_friend)),
    'songs', coalesce((select json_agg(x order by ts desc) from (
        select json_build_object('title', title, 'artist', artist, 'artwork', artwork, 'preview_url', preview_url, 'track_url', track_url,
          'mine', user_id = auth.uid(), 'from', 'post', 'mood', mood) x, created_at ts
          from posts where user_id in (auth.uid(), p_friend)
            and created_at >= (select created_at from friendships where user_a = least(auth.uid(), p_friend) and user_b = greatest(auth.uid(), p_friend))
        union all
        select json_build_object('title', song->>'title', 'artist', song->>'artist', 'artwork', song->>'artwork', 'preview_url', song->>'preview_url', 'track_url', song->>'track_url',
          'mine', sender = auth.uid(), 'from', 'gift', 'mood', '') x, created_at ts
          from gifts where (sender = auth.uid() and receiver = p_friend) or (sender = p_friend and receiver = auth.uid() and not anonymous)
        limit 100) s), '[]'::json)) end;
$$;

-- ═════════ ⑮ 見守り（気持ちのSOS） ═════════
-- 本人にだけ、そっと相談先を案内する（フレンドには伝わらない・プッシュもしない）
create or replace function public.care_check(p_user uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare risky boolean; streak int;
begin
  risky := coalesce(p_text, '') ~ '(死にたい|しにたい|消えたい|きえたい|自殺|じさつ|リスカ|自傷|もう無理|生きてる意味|いなくなりたい|楽になりたい|死のう)';
  select count(*) into streak from (select mood from posts where user_id = p_user order by created_at desc limit 3) t where public.mood_tone(mood) = -1;
  if risky or streak >= 3 then
    perform public.notify(p_user, 'care', '🌙 少しだけ、話してみない？', 'つらい時は、ひとりで抱えなくていいよ',
      '/?care=1', jsonb_build_object('reason', case when risky then 'words' else 'streak' end), false,
      'care:' || (now() at time zone 'Asia/Tokyo')::date);
  end if;
end $$;
create or replace function public.tg_post_care() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.care_check(new.user_id, new.comment); return null; end $$;
drop trigger if exists post_care on public.posts;
create trigger post_care after insert on public.posts for each row execute function public.tg_post_care();
create or replace function public.tg_whisper_care() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.care_check(new.user_id, new.text); return null; end $$;
drop trigger if exists whisper_care on public.whispers;
create trigger whisper_care after insert on public.whispers for each row execute function public.tg_whisper_care();

-- ═════════ 権限 ═════════
revoke all on function public.notify(uuid, text, text, text, text, jsonb, boolean, text), public.tg_notification_push(),
  public.deliver_letters(), public.anniversaries(), public.clear_whispers(), public.care_check(uuid, text),
  public.tg_post_care(), public.tg_whisper_care() from public, anon, authenticated;
revoke all on function public.my_notifications(int), public.read_notifications(), public.send_gift(uuid, jsonb, text, boolean, uuid),
  public.my_gifts(), public.open_gift(uuid), public.mark_listened(uuid), public.same_mood(text), public.post_whisper(text, text, jsonb),
  public.night_feed(), public.hug_whisper(uuid), public.report_whisper(uuid, text), public.start_relay(text, jsonb, text),
  public.add_relay_song(uuid, jsonb, text), public.my_relays(), public.can_see_relay(uuid), public.write_letter(jsonb, text, text, int),
  public.my_letters(), public.open_note(uuid), public.add_note_entry(uuid, jsonb, text), public.my_notes(), public.pair_playlist(uuid)
  from public, anon;
grant execute on function public.my_notifications(int), public.read_notifications(), public.send_gift(uuid, jsonb, text, boolean, uuid),
  public.my_gifts(), public.open_gift(uuid), public.mark_listened(uuid), public.same_mood(text), public.post_whisper(text, text, jsonb),
  public.night_feed(), public.hug_whisper(uuid), public.report_whisper(uuid, text), public.start_relay(text, jsonb, text),
  public.add_relay_song(uuid, jsonb, text), public.my_relays(), public.can_see_relay(uuid), public.write_letter(jsonb, text, text, int),
  public.my_letters(), public.open_note(uuid), public.add_note_entry(uuid, jsonb, text), public.my_notes(), public.pair_playlist(uuid)
  to authenticated;

-- ═════════ リアルタイム ═════════
do $$
begin
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;

-- ═════════ 定期実行（pg_cron は UTC） ═════════
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job where jobname in ('hearme-letters', 'hearme-anniv', 'hearme-whispers');
    perform cron.schedule('hearme-letters', '5 * * * *', 'select public.deliver_letters()');      -- 毎時5分：手紙の配達
    perform cron.schedule('hearme-anniv', '0 0 * * *', 'select public.anniversaries()');          -- 毎日9:00 JST：記念日
    perform cron.schedule('hearme-whispers', '0 21 * * *', 'select public.clear_whispers()');      -- 毎朝6:00 JST：ひとりごとを消す
  end if;
end $$;

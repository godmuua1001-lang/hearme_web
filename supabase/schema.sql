-- ═══════════════════════════════════════════════════════════════
-- hearme v7 — Supabase schema
-- Supabase ダッシュボード → SQL Editor → New query に全部貼って「Run」
-- 何度実行しても壊れないように作ってあります（再実行OK）
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────── TABLES ─────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 20),
  emoji       text not null default '🎧' check (char_length(emoji) <= 8),
  avatar      text check (avatar is null or char_length(avatar) < 90000),
  bio         text not null default '' check (char_length(bio) <= 40),
  code        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.friendships (
  user_a      uuid not null references public.profiles(id) on delete cascade,
  user_b      uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b_idx on public.friendships(user_b);

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  track_id    bigint,
  title       text not null check (char_length(title) between 1 and 200),
  artist      text not null default '' check (char_length(artist) <= 200),
  artwork     text check (artwork is null or artwork ~ '^https://'),
  preview_url text check (preview_url is null or preview_url ~ '^https://'),
  track_url   text check (track_url is null or track_url ~ '^https://'),
  mood        text not null check (char_length(mood) between 1 and 20),
  comment     text not null default '' check (char_length(comment) <= 60),
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists posts_user_idx on public.posts(user_id, created_at desc);
create index if not exists posts_public_idx on public.posts(created_at desc) where is_public;

create table if not exists public.reactions (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (emoji in ('❤️','😢','👏','✨','🫂','🔥')),
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  sender      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  receiver    uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 1000),
  song        jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (sender <> receiver),
  check (char_length(body) > 0 or song is not null)
);
create index if not exists messages_pair_idx on public.messages(least(sender,receiver), greatest(sender,receiver), id desc);
create index if not exists messages_receiver_idx on public.messages(receiver) where read_at is null;

create table if not exists public.blocks (
  blocker     uuid not null references public.profiles(id) on delete cascade,
  blocked     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete set null,
  target_user uuid references public.profiles(id) on delete set null,
  reason      text not null default '' check (char_length(reason) <= 200),
  created_at  timestamptz not null default now()
);

-- ───────────── 権限（「Automatically expose new tables」がオフでも動くように明示） ─────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.friendships, public.posts, public.reactions,
  public.messages, public.blocks, public.reports to authenticated;
grant usage on all sequences in schema public to authenticated;

-- ───────────── HELPERS ─────────────
create or replace function public.gen_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where code = c);
  end loop;
  return c;
end $$;

alter table public.profiles alter column code set default public.gen_code();

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_a = least(a,b) and user_b = greatest(a,b));
$$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

create or replace function public.can_see_post(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts p
    where p.id = p_post
      and (p.user_id = auth.uid()
           or ((public.are_friends(auth.uid(), p.user_id) or p.is_public)
               and not public.is_blocked(auth.uid(), p.user_id)))
  );
$$;

-- コードは変更不可 / 投稿は1日(日本時間)3回まで
create or replace function public.tg_keep_code() returns trigger
language plpgsql as $$ begin new.code := old.code; new.id := old.id; return new; end $$;
drop trigger if exists keep_code on public.profiles;
create trigger keep_code before update on public.profiles for each row execute function public.tg_keep_code();

create or replace function public.tg_post_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from posts
      where user_id = new.user_id
        and created_at >= date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo') >= 3 then
    raise exception 'POST_LIMIT' using hint = '投稿は1日3回までです';
  end if;
  return new;
end $$;
drop trigger if exists post_limit on public.posts;
create trigger post_limit before insert on public.posts for each row execute function public.tg_post_limit();

-- ───────────── ROW LEVEL SECURITY ─────────────
alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.posts       enable row level security;
alter table public.reactions   enable row level security;
alter table public.messages    enable row level security;
alter table public.blocks      enable row level security;
alter table public.reports     enable row level security;

drop policy if exists "profiles read self+friends" on public.profiles;
create policy "profiles read self+friends" on public.profiles for select to authenticated
  using (id = auth.uid() or public.are_friends(auth.uid(), id));
drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self" on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "friendships read own" on public.friendships;
create policy "friendships read own" on public.friendships for select to authenticated
  using (auth.uid() in (user_a, user_b));

-- 公開投稿は匿名性のため public_feed() 経由でのみ読む（user_id を見せない）
drop policy if exists "posts read own+friends" on public.posts;
create policy "posts read own+friends" on public.posts for select to authenticated
  using (user_id = auth.uid()
         or (public.are_friends(auth.uid(), user_id) and not public.is_blocked(auth.uid(), user_id)));
drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own" on public.posts for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "reactions read" on public.reactions;
create policy "reactions read" on public.reactions for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

drop policy if exists "messages read own" on public.messages;
create policy "messages read own" on public.messages for select to authenticated
  using (auth.uid() in (sender, receiver));
drop policy if exists "messages send to friends" on public.messages;
create policy "messages send to friends" on public.messages for insert to authenticated
  with check (sender = auth.uid()
              and public.are_friends(sender, receiver)
              and not public.is_blocked(sender, receiver));

drop policy if exists "blocks read own" on public.blocks;
create policy "blocks read own" on public.blocks for select to authenticated using (blocker = auth.uid());

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports for insert to authenticated with check (reporter = auth.uid());

-- ───────────── RPC (アプリから呼ぶ関数) ─────────────
create or replace function public.add_friend(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other profiles;
begin
  if me is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into other from profiles where code = upper(trim(p_code));
  if other.id is null then raise exception 'CODE_NOT_FOUND' using hint = 'コードが見つかりません'; end if;
  if other.id = me then raise exception 'SELF_CODE' using hint = '自分のコードです'; end if;
  if public.is_blocked(me, other.id) then raise exception 'CODE_NOT_FOUND' using hint = 'コードが見つかりません'; end if;
  insert into friendships(user_a, user_b) values (least(me, other.id), greatest(me, other.id))
    on conflict do nothing;
  return json_build_object('id', other.id, 'name', other.name, 'emoji', other.emoji,
                           'avatar', other.avatar, 'bio', other.bio);
end $$;

create or replace function public.remove_friend(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where user_a = least(auth.uid(), p_id) and user_b = greatest(auth.uid(), p_id);
$$;

create or replace function public.block_user(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or p_id = auth.uid() then return; end if;
  insert into blocks(blocker, blocked) values (auth.uid(), p_id) on conflict do nothing;
  delete from friendships where user_a = least(auth.uid(), p_id) and user_b = greatest(auth.uid(), p_id);
end $$;

-- 匿名投稿の作者をブロック（作者が誰かは返さない）
create or replace function public.block_post_author(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from posts where id = p_post and (is_public or public.are_friends(auth.uid(), user_id));
  if uid is not null then perform public.block_user(uid); end if;
end $$;

create or replace function public.unblock_all() returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker = auth.uid();
$$;

create or replace function public.react(p_post uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_post(p_post) then raise exception 'NOT_ALLOWED'; end if;
  if p_emoji is null then
    delete from reactions where post_id = p_post and user_id = auth.uid();
  else
    insert into reactions(post_id, user_id, emoji) values (p_post, auth.uid(), p_emoji)
      on conflict (post_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end $$;

-- 投稿1件ぶんの共通の形
create or replace function public._post_json(p posts, show_author boolean) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'artist', p.artist, 'artwork', p.artwork,
    'preview_url', p.preview_url, 'track_url', p.track_url, 'track_id', p.track_id,
    'mood', p.mood, 'comment', p.comment, 'is_public', p.is_public, 'created_at', p.created_at,
    'mine', p.user_id = auth.uid(),
    'author', case when show_author or p.user_id = auth.uid() then
        (select json_build_object('id', pr.id, 'name', pr.name, 'emoji', pr.emoji, 'avatar', pr.avatar)
           from profiles pr where pr.id = p.user_id)
      else json_build_object('id', null, 'name', 'どこかの誰か',
             'emoji', (array['🌙','🌊','🌸','⚡','🦋','🍂','☁️','🌿'])[1 + abs(hashtext(p.id::text)) % 8],
             'avatar', null) end,
    'my_reaction', (select r.emoji from reactions r where r.post_id = p.id and r.user_id = auth.uid()),
    'reactions', coalesce((select json_object_agg(emoji, n) from
        (select emoji, count(*) n from reactions r where r.post_id = p.id group by emoji) t), '{}'::json)
  );
$$;

create or replace function public.friend_feed(p_limit int default 50) returns setof json
language sql stable security definer set search_path = public as $$
  select public._post_json(p, true) from posts p
  where (p.user_id = auth.uid()
         or (public.are_friends(auth.uid(), p.user_id) and not public.is_blocked(auth.uid(), p.user_id)))
    and p.created_at > now() - interval '7 days'
  order by p.created_at desc limit least(p_limit, 100);
$$;

create or replace function public.public_feed(p_limit int default 40, p_before timestamptz default null) returns setof json
language sql stable security definer set search_path = public as $$
  select public._post_json(p, public.are_friends(auth.uid(), p.user_id)) from posts p
  where p.is_public
    and p.user_id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.user_id)
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc limit least(p_limit, 100);
$$;

create or replace function public.my_posts(p_limit int default 60) returns setof json
language sql stable security definer set search_path = public as $$
  select public._post_json(p, true) from posts p where p.user_id = auth.uid()
  order by p.created_at desc limit least(p_limit, 200);
$$;

create or replace function public.my_friends() returns setof json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', pr.id, 'name', pr.name, 'emoji', pr.emoji, 'avatar', pr.avatar,
      'bio', pr.bio, 'since', f.created_at,
      'last_post', (select json_build_object('title', p.title, 'artist', p.artist, 'mood', p.mood, 'created_at', p.created_at)
                      from posts p where p.user_id = pr.id order by p.created_at desc limit 1))
  from friendships f
  join profiles pr on pr.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where auth.uid() in (f.user_a, f.user_b)
  order by f.created_at desc;
$$;

create or replace function public.dm_threads() returns setof json
language sql stable security definer set search_path = public as $$
  with fr as (
    select case when f.user_a = auth.uid() then f.user_b else f.user_a end as peer
    from friendships f where auth.uid() in (f.user_a, f.user_b)
  )
  select json_build_object(
    'peer', json_build_object('id', pr.id, 'name', pr.name, 'emoji', pr.emoji, 'avatar', pr.avatar),
    'last', (select json_build_object('body', m.body, 'song', m.song is not null, 'created_at', m.created_at, 'mine', m.sender = auth.uid())
               from messages m
              where least(m.sender,m.receiver) = least(auth.uid(), pr.id)
                and greatest(m.sender,m.receiver) = greatest(auth.uid(), pr.id)
              order by m.id desc limit 1),
    'unread', (select count(*) from messages m where m.sender = pr.id and m.receiver = auth.uid() and m.read_at is null)
  )
  from fr join profiles pr on pr.id = fr.peer
  order by (select max(m.id) from messages m
             where least(m.sender,m.receiver) = least(auth.uid(), pr.id)
               and greatest(m.sender,m.receiver) = greatest(auth.uid(), pr.id)) desc nulls last;
$$;

create or replace function public.mark_read(p_peer uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now() where sender = p_peer and receiver = auth.uid() and read_at is null;
$$;

-- 自分の投稿についたリアクション（フレンドは名前つき、知らない人は匿名）
create or replace function public.my_activity(p_limit int default 40) returns setof json
language sql stable security definer set search_path = public as $$
  select json_build_object('emoji', r.emoji, 'created_at', r.created_at,
      'post', json_build_object('id', p.id, 'title', p.title, 'artist', p.artist),
      'who', case when public.are_friends(auth.uid(), r.user_id)
                  then (select json_build_object('name', pr.name, 'emoji', pr.emoji, 'avatar', pr.avatar) from profiles pr where pr.id = r.user_id)
                  else json_build_object('name', 'どこかの誰か', 'emoji', '✨', 'avatar', null) end)
  from reactions r join posts p on p.id = r.post_id
  where p.user_id = auth.uid() and r.user_id <> auth.uid()
  order by r.created_at desc limit least(p_limit, 100);
$$;

create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

-- 実行権限：ログイン済み（匿名含む）ユーザーのみ
revoke all on function public.add_friend(text), public.remove_friend(uuid), public.block_user(uuid),
  public.block_post_author(uuid), public.unblock_all(), public.react(uuid, text), public.friend_feed(int),
  public.public_feed(int, timestamptz), public.my_posts(int), public.my_friends(), public.dm_threads(),
  public.mark_read(uuid), public.my_activity(int), public.delete_me(),
  public._post_json(public.posts, boolean), public.are_friends(uuid, uuid), public.is_blocked(uuid, uuid),
  public.can_see_post(uuid), public.gen_code() from public, anon;
revoke all on function public._post_json(public.posts, boolean), public.tg_keep_code(), public.tg_post_limit()
  from authenticated;
grant execute on function public.add_friend(text), public.remove_friend(uuid), public.block_user(uuid),
  public.block_post_author(uuid), public.unblock_all(), public.react(uuid, text), public.friend_feed(int),
  public.public_feed(int, timestamptz), public.my_posts(int), public.my_friends(), public.dm_threads(),
  public.mark_read(uuid), public.my_activity(int), public.delete_me(),
  public.are_friends(uuid, uuid), public.is_blocked(uuid, uuid), public.can_see_post(uuid), public.gen_code()
  to authenticated;

-- ───────────── REALTIME ─────────────
do $$
begin
  begin alter publication supabase_realtime add table public.messages;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.posts;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reactions; exception when duplicate_object then null; end;
end $$;

-- ═══════════════ PUSH 通知 / 毎日の hearme タイム ═══════════════
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  daily       boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 毎日1回、ランダムな時刻に「今の気分は？」(BeReal方式)。サーバー側で決めて全員共通
create table if not exists public.moments (
  day   date primary key,
  at    timestamptz not null
);
alter table public.moments enable row level security;
grant select on public.moments to authenticated;
drop policy if exists "moments read" on public.moments;
create policy "moments read" on public.moments for select to authenticated using (true);

alter table public.posts add column if not exists on_time boolean not null default false;

create or replace function public.tg_post_on_time() returns trigger
language plpgsql security definer set search_path = public as $$
declare m timestamptz;
begin
  select at into m from moments where day = (now() at time zone 'Asia/Tokyo')::date;
  new.on_time := m is not null and now() between m and m + interval '10 minutes';
  return new;
end $$;
drop trigger if exists post_on_time on public.posts;
create trigger post_on_time before insert on public.posts for each row execute function public.tg_post_on_time();

-- 今日の時刻が来ていなければ作る（毎時呼ばれ、10〜22時のどこか1時間で発火）
create or replace function public.ensure_moment() returns json
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Tokyo')::date; m moments; target_hour int;
begin
  select * into m from moments where day = d;
  if m.day is not null then return json_build_object('fired', false, 'at', m.at); end if;
  target_hour := 10 + abs(hashtext(d::text || 'hearme')) % 13;   -- 10:00〜22:59
  if extract(hour from now() at time zone 'Asia/Tokyo') >= target_hour then
    insert into moments(day, at) values (d, now()) on conflict do nothing returning * into m;
    if m.day is not null then return json_build_object('fired', true, 'at', m.at); end if;
  end if;
  return json_build_object('fired', false, 'at', null);
end $$;
revoke all on function public.ensure_moment(), public.tg_post_on_time() from public, anon, authenticated;

create or replace function public.today_moment() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('at', at) from moments where day = (now() at time zone 'Asia/Tokyo')::date;
$$;
grant execute on function public.today_moment() to authenticated;

-- _post_json に on_time を追加
create or replace function public._post_json(p posts, show_author boolean) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'artist', p.artist, 'artwork', p.artwork,
    'preview_url', p.preview_url, 'track_url', p.track_url, 'track_id', p.track_id,
    'mood', p.mood, 'comment', p.comment, 'is_public', p.is_public, 'created_at', p.created_at,
    'on_time', p.on_time, 'mine', p.user_id = auth.uid(),
    'author', case when show_author or p.user_id = auth.uid() then
        (select json_build_object('id', pr.id, 'name', pr.name, 'emoji', pr.emoji, 'avatar', pr.avatar)
           from profiles pr where pr.id = p.user_id)
      else json_build_object('id', null, 'name', 'どこかの誰か',
             'emoji', (array['🌙','🌊','🌸','⚡','🦋','🍂','☁️','🌿'])[1 + abs(hashtext(p.id::text)) % 8],
             'avatar', null) end,
    'my_reaction', (select r.emoji from reactions r where r.post_id = p.id and r.user_id = auth.uid()),
    'reactions', coalesce((select json_object_agg(emoji, n) from
        (select emoji, count(*) n from reactions r where r.post_id = p.id group by emoji) t), '{}'::json)
  );
$$;
revoke all on function public._post_json(public.posts, boolean) from public, anon, authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.moments; exception when duplicate_object then null; end;
end $$;

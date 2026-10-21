-- ═══════════════════════════════════════════════════════════════
-- hearme v10 — プロフィール（お気に入りの曲・虹コレクション）
-- v9.1.sql の後に SQL Editor で Run（何度実行してもOK）
-- ═══════════════════════════════════════════════════════════════

-- お気に入りの曲（最大5曲）
alter table public.profiles add column if not exists fav_songs jsonb not null default '[]'::jsonb;
alter table public.profiles drop constraint if exists profiles_fav_songs_chk;
alter table public.profiles add constraint profiles_fav_songs_chk
  check (jsonb_typeof(fav_songs) = 'array' and jsonb_array_length(fav_songs) <= 5 and pg_column_size(fav_songs) < 6000);

-- 虹コレクション（1日1つ。中身はサーバーが今日の虹から作るので改ざんできない）
create table if not exists public.rainbows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  data       jsonb not null check (pg_column_size(data) < 4000),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.rainbows enable row level security;
revoke all on public.rainbows from anon, authenticated;   -- 読み書きは下の関数だけ

create or replace function public.save_rainbow() returns json
language plpgsql security definer set search_path = public as $$
declare r json := public.today_rainbow(); d date := (now() at time zone 'Asia/Tokyo')::date; out json;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(json_array_length(r->'moods'), 0) = 0 then raise exception 'EMPTY_RAINBOW'; end if;
  insert into rainbows(user_id, day, data)
  values (auth.uid(), d, jsonb_build_object('total', (r->>'total')::int,
          'moods', (select jsonb_agg(jsonb_build_object('e', m->>'e', 'n', (m->>'n')::int)) from json_array_elements(r->'moods') m)))
  on conflict (user_id, day) do update set data = excluded.data, created_at = now();
  select json_build_object('id', id, 'day', day, 'data', data) into out from rainbows where user_id = auth.uid() and day = d;
  return out;
end $$;

create or replace function public.delete_rainbow(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from rainbows where id = p_id and user_id = auth.uid();
$$;

-- プロフィール（自分か、フレンドだけ見られる）
create or replace function public.friend_profile(p_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); pr profiles;
begin
  if me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_id <> me and (not public.are_friends(me, p_id) or public.is_blocked(me, p_id)) then raise exception 'NOT_ALLOWED'; end if;
  select * into pr from profiles where id = p_id;
  if pr.id is null then raise exception 'NOT_FOUND'; end if;
  return json_build_object(
    'id', pr.id, 'name', pr.name, 'emoji', pr.emoji, 'avatar', pr.avatar, 'bio', pr.bio, 'fav_songs', pr.fav_songs,
    'since', (select f.created_at from friendships f where (f.user_a = me and f.user_b = p_id) or (f.user_a = p_id and f.user_b = me)),
    'friends', (select count(*) from friendships f where p_id in (f.user_a, f.user_b)),
    'days', (select count(distinct (p.created_at at time zone 'Asia/Tokyo')::date) from posts p where p.user_id = p_id),
    'posts', coalesce((select json_agg(x order by (x->>'created_at') desc) from (
        select public._post_json(p, true) x from posts p where p.user_id = p_id order by p.created_at desc limit 30) t), '[]'::json),
    'rainbows', coalesce((select json_agg(json_build_object('id', r.id, 'day', r.day, 'data', r.data) order by r.day desc)
        from (select * from rainbows where user_id = p_id order by day desc limit 60) r), '[]'::json)
  );
end $$;

revoke all on function public.save_rainbow(), public.delete_rainbow(uuid), public.friend_profile(uuid) from public, anon;
grant execute on function public.save_rainbow(), public.delete_rainbow(uuid), public.friend_profile(uuid) to authenticated;

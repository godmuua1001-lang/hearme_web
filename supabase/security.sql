-- ═══════════════════════════════════════════════════════════════
-- hearme — セキュリティ強化（2026-10 レビュー対応）
-- SQL Editor に貼って Run（何度実行してもOK）
-- ═══════════════════════════════════════════════════════════════

-- ① 招待コードの総当たり対策：失敗は1時間10回・1日30回まで
create table if not exists public.friend_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists friend_attempts_idx on public.friend_attempts(user_id, at desc);
alter table public.friend_attempts enable row level security;   -- アプリからは直接触れない

create or replace function public.add_friend(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other profiles;
begin
  if me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if (select count(*) from friend_attempts where user_id = me and at > now() - interval '1 hour') >= 10
     or (select count(*) from friend_attempts where user_id = me and at > now() - interval '1 day') >= 30 then
    raise exception 'TOO_MANY_TRIES' using hint = 'しばらく時間をおいてから試してください';
  end if;
  select * into other from profiles where code = upper(trim(p_code));
  if other.id is null or public.is_blocked(me, other.id) then
    insert into friend_attempts(user_id) values (me);   -- 失敗だけ記録
    return json_build_object('error', 'CODE_NOT_FOUND');
  end if;
  if other.id = me then raise exception 'SELF_CODE' using hint = '自分のコードです'; end if;
  insert into friendships(user_a, user_b) values (least(me, other.id), greatest(me, other.id))
    on conflict do nothing;
  return json_build_object('id', other.id, 'name', other.name, 'emoji', other.emoji,
                           'avatar', other.avatar, 'bio', other.bio);
end $$;
-- ※ 失敗を記録するため、見つからない時は例外ではなく {"error":"CODE_NOT_FOUND"} を返す
--   （例外にするとトランザクションごと記録が消えるため）
revoke all on function public.add_friend(text) from public, anon;
grant execute on function public.add_friend(text) to authenticated;

-- ② 画像・音源のURLは Apple の配信元だけ許可（外部の画像やトラッキングを防ぐ）
delete from public.posts
 where (artwork is not null and artwork !~ '^https://is[0-9]+-ssl\.mzstatic\.com/')
    or (preview_url is not null and preview_url !~ '^https://audio-ssl\.itunes\.apple\.com/');
alter table public.posts drop constraint if exists posts_artwork_host;
alter table public.posts add constraint posts_artwork_host
  check (artwork is null or artwork ~ '^https://is[0-9]+-ssl\.mzstatic\.com/');
alter table public.posts drop constraint if exists posts_preview_host;
alter table public.posts add constraint posts_preview_host
  check (preview_url is null or preview_url ~ '^https://audio-ssl\.itunes\.apple\.com/');
alter table public.posts drop constraint if exists posts_track_host;
alter table public.posts add constraint posts_track_host
  check (track_url is null or track_url ~ '^https://(music|itunes)\.apple\.com/');

-- ③ アイコン画像は「端末で縮小したJPEG/PNG/WebP」だけ
update public.profiles set avatar = null
 where avatar is not null and avatar !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$';
alter table public.profiles drop constraint if exists profiles_avatar_format;
alter table public.profiles add constraint profiles_avatar_format
  check (avatar is null or avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$');

-- ④ DMに添付する曲データは小さく・決まった形だけ
alter table public.messages drop constraint if exists messages_song_shape;
alter table public.messages add constraint messages_song_shape
  check (song is null or (jsonb_typeof(song) = 'object' and pg_column_size(song) < 2000));

-- ⑤ 内部用の関数はアプリから呼べないように
--    （gen_code はプロフィール作成時のコード発行に使うので authenticated には残す）
revoke all on function public.gen_code() from anon;
revoke all on function public.today_moment() from anon;

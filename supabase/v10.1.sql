-- ═══════════════════════════════════════════════════════════════
-- hearme v10.1 — 外部レビューの指摘への対策（セキュリティ）
-- v10.sql の後に SQL Editor で Run（何度実行してもOK）
-- ※ アプリ側（v10.3）を先に公開済み。順番はこのままで大丈夫です
-- ═══════════════════════════════════════════════════════════════

-- ① 15秒聴かないと読めない：サーバー側で「聴きはじめた時刻」から15秒たったかを確かめる
create table if not exists public.listen_starts (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.listen_starts enable row level security;
revoke all on public.listen_starts from anon, authenticated;

create or replace function public.start_listen(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_see_post(p_post) then return; end if;
  insert into listen_starts(post_id, user_id) values (p_post, auth.uid()) on conflict do nothing;  -- 最初の時刻を残す
end $$;

create or replace function public.mark_listened(p_post uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p posts; n int; who text; st timestamptz;
begin
  select * into p from posts where id = p_post;
  if p.id is null or not public.can_see_post(p_post) then return json_build_object('comment', null); end if;
  if p.user_id = me then return json_build_object('comment', p.comment); end if;
  -- すでに聴いた人には返す
  if exists (select 1 from listens where post_id = p_post and user_id = me) then return json_build_object('comment', p.comment); end if;
  -- 試聴できる曲は、聴きはじめてから14秒以上たっていないと開かない（試聴がない曲はそのまま）
  if p.preview_url is not null then
    select started_at into st from listen_starts where post_id = p_post and user_id = me;
    if st is null or now() - st < interval '14 seconds' then return json_build_object('comment', null, 'wait', true); end if;
  end if;
  insert into listens(post_id, user_id) values (p_post, me) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    who := case when public.are_friends(me, p.user_id) then (select name from profiles where id = me) else 'どこかの誰か' end;
    perform public.notify(p.user_id, 'listened', '🎧 ' || who || 'があなたの曲を聴いてくれたよ',
      '「' || p.title || '」', '/?post=' || p.id, jsonb_build_object('post_id', p.id), false);
  end if;
  return json_build_object('comment', p.comment);
end $$;
revoke all on function public.start_listen(uuid), public.mark_listened(uuid) from public, anon;
grant execute on function public.start_listen(uuid), public.mark_listened(uuid) to authenticated;

-- ② 招待コードはフレンドからも見えないようにする（本人だけ my_code() で読む）
-- 招待コードを作る関数は、コードの重複チェックで profiles を読むので「関数の持ち主の権限」で動かす
alter function public.gen_code() security definer;
revoke select on public.profiles from anon, authenticated;
grant select (id, name, emoji, avatar, bio, created_at, fav_songs) on public.profiles to authenticated;
create or replace function public.my_code() returns text
language sql stable security definer set search_path = public as $$ select code from profiles where id = auth.uid(); $$;
create or replace function public.my_settings() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('code', code, 'share_rain', share_rain) from profiles where id = auth.uid(); $$;
revoke all on function public.my_code(), public.my_settings() from public, anon;
grant execute on function public.my_code(), public.my_settings() to authenticated;

-- ③ ブロックの一覧は直接読めないようにする（匿名投稿の作者が分かってしまうため）
drop policy if exists "blocks read own" on public.blocks;
revoke select, insert, update, delete on public.blocks from anon, authenticated;

-- ④ 投稿：日時はサーバーが決める＆1日3回は「消しても戻らない」回数で数える
create table if not exists public.post_quota (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  n       int  not null default 0,
  primary key (user_id, day)
);
alter table public.post_quota enable row level security;
revoke all on public.post_quota from anon, authenticated;
create or replace function public.tg_post_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  new.created_at := now();
  insert into post_quota(user_id, day, n) values (new.user_id, (now() at time zone 'Asia/Tokyo')::date, 1)
  on conflict (user_id, day) do update set n = post_quota.n + 1
  returning n into c;                       -- 同時に送っても行ロックで順番に数える
  if c > 3 then raise exception 'POST_LIMIT' using hint = '投稿は1日3回までです'; end if;
  return new;
end $$;
drop trigger if exists post_limit on public.posts;
create trigger post_limit before insert on public.posts for each row execute function public.tg_post_limit();

-- ⑤ DM：日時・既読はサーバーが決める＆送りすぎを止める（1分20通・1日500通）
create index if not exists messages_sender_time on public.messages(sender, created_at desc);
create or replace function public.tg_msg_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now(); new.read_at := null;
  if (select count(*) from messages where sender = new.sender and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from messages where sender = new.sender and created_at > now() - interval '1 day') >= 500 then
    raise exception 'RATE_LIMIT' using hint = '少し時間をおいてね';
  end if;
  return new;
end $$;
drop trigger if exists msg_guard on public.messages;
create trigger msg_guard before insert on public.messages for each row execute function public.tg_msg_guard();

-- ⑥ 通報・お問い合わせも送りすぎを止める（1時間10件）
create or replace function public.tg_report_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from reports where reporter = new.reporter and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  return new;
end $$;
drop trigger if exists report_guard on public.reports;
create trigger report_guard before insert on public.reports for each row execute function public.tg_report_guard();

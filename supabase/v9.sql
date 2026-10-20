-- ═══════════════════════════════════════════════════════════════
-- hearme v9 — 時間システムをやめて「虹・聴いて開く・寄り添い・シンクロ」へ
-- v8.sql の後に SQL Editor で Run（何度実行してもOK）
-- ═══════════════════════════════════════════════════════════════

-- 雨の日にフレンドへ知らせるか（本人が設定でオフにできる）
alter table public.profiles add column if not exists share_rain boolean not null default true;

-- ═════════ 今日の虹 ═════════
create or replace function public.today_rainbow() returns json
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select case when f.user_a = auth.uid() then f.user_b else f.user_a end
      from friendships f where auth.uid() in (f.user_a, f.user_b)
  ),
  latest as (
    select distinct on (p.user_id) p.user_id, split_part(p.mood, ' ', 1) as e
    from posts p join people on people.id = p.user_id
    where p.created_at >= date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
      and not public.is_blocked(auth.uid(), p.user_id)
    order by p.user_id, p.created_at desc
  )
  select json_build_object(
    'total', (select count(*) from people),
    'waiting', (select count(*) from people where id not in (select user_id from latest)),
    'me', (select e from latest where user_id = auth.uid()),
    'moods', coalesce((select json_agg(json_build_object('e', e, 'n', n, 'names', names, 'ids', ids)) from (
        select l.e, count(*) n,
               json_agg(case when l.user_id = auth.uid() then 'あなた' else pr.name end order by l.user_id = auth.uid() desc) names,
               json_agg(l.user_id) ids
        from latest l join profiles pr on pr.id = l.user_id group by l.e) t), '[]'::json));
$$;

-- ═════════ ① 聴かないと読めない ═════════
-- ひとことは「本人」「その曲を聴いた人」「試聴できない曲」のときだけ返す
create or replace function public._post_json(p posts, show_author boolean) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'artist', p.artist, 'artwork', p.artwork,
    'preview_url', p.preview_url, 'track_url', p.track_url, 'track_id', p.track_id,
    'mood', p.mood, 'mood_x', p.mood_x, 'mood_y', p.mood_y,
    'comment', case when p.user_id = auth.uid() or p.preview_url is null
                      or exists (select 1 from listens l where l.post_id = p.id and l.user_id = auth.uid())
                    then p.comment else null end,
    'has_comment', p.comment <> '',
    'is_public', p.is_public, 'created_at', p.created_at, 'on_time', false,
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

-- 聴いたら（アプリ側で15秒）ひとことを返す
drop function if exists public.mark_listened(uuid);
create or replace function public.mark_listened(p_post uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p posts; n int; who text;
begin
  select * into p from posts where id = p_post;
  if p.id is null or not public.can_see_post(p_post) then return json_build_object('comment', null); end if;
  if p.user_id = me then return json_build_object('comment', p.comment); end if;
  insert into listens(post_id, user_id) values (p_post, me) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    who := case when public.are_friends(me, p.user_id) then (select name from profiles where id = me) else 'どこかの誰か' end;
    perform public.notify(p.user_id, 'listened', '🎧 ' || who || 'があなたの曲を聴いてくれたよ',
      '「' || p.title || '」', '/?post=' || p.id, jsonb_build_object('post_id', p.id), false);
  end if;
  return json_build_object('comment', p.comment);
end $$;
revoke all on function public.mark_listened(uuid) from public, anon;
grant execute on function public.mark_listened(uuid) to authenticated;

-- ═════════ ② 寄り添い通知 ＆ ③ シンクロ（投稿したとき） ═════════
create or replace function public.tg_post_social() returns trigger
language plpgsql security definer set search_path = public as $$
declare me profiles; f record; d text := ((now() at time zone 'Asia/Tokyo')::date)::text;
        e text := split_part(new.mood, ' ', 1); label text := split_part(new.mood, ' ', 2); other posts;
begin
  select * into me from profiles where id = new.user_id;
  for f in
    select case when fr.user_a = new.user_id then fr.user_b else fr.user_a end as id
    from friendships fr where new.user_id in (fr.user_a, fr.user_b)
  loop
    continue when public.is_blocked(new.user_id, f.id);
    -- ② 雨の日（本人がオンにしているときだけ）
    if public.mood_tone(new.mood) = -1 and me.share_rain then
      perform public.notify(f.id, 'rain', '🌧 ' || me.name || 'の空が、雨みたい', '寄り添う1曲を贈る？',
        '/?giftto=' || new.user_id || '&post=' || new.id, jsonb_build_object('friend', new.user_id, 'post', new.id), true,
        'rain:' || new.user_id || ':' || d);
    end if;
    -- ③ シンクロ：今日、同じ曲
    select * into other from posts
      where user_id = f.id
        and created_at >= date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
        and ((new.track_id is not null and track_id = new.track_id)
             or (lower(title) = lower(new.title) and lower(artist) = lower(new.artist)))
      limit 1;
    if other.id is not null then
      perform public.notify(f.id, 'sync', '✨ ' || me.name || 'とシンクロ', '今日、ふたりとも「' || new.title || '」を選びました',
        '/?post=' || new.id, jsonb_build_object('friend', new.user_id, 'title', new.title), true, 'sync:' || new.user_id || ':' || d);
      perform public.notify(new.user_id, 'sync', '✨ ' || (select name from profiles where id = f.id) || 'とシンクロ',
        '今日、ふたりとも「' || new.title || '」を選びました', '/?post=' || other.id, jsonb_build_object('friend', f.id, 'title', new.title), true,
        'sync:' || f.id || ':' || d);
    -- シンクロ：今日、同じ色
    elsif exists (select 1 from posts where user_id = f.id and split_part(mood, ' ', 1) = e
                  and created_at >= date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo') then
      perform public.notify(new.user_id, 'sync_mood', '🌈 ' || (select name from profiles where id = f.id) || 'と同じ色の日',
        'ふたりとも今日は「' || label || '」', '/', jsonb_build_object('friend', f.id, 'e', e), false, 'syncm:' || f.id || ':' || d);
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.tg_post_social() from public, anon, authenticated;
drop trigger if exists post_social on public.posts;
create trigger post_social after insert on public.posts for each row execute function public.tg_post_social();

-- 権限
revoke all on function public.today_rainbow() from public, anon;
grant execute on function public.today_rainbow() to authenticated;

-- ═════════ 時間システム（毎日のhearmeの時間）を止める ═════════
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job where jobname = 'hearme-tick';
  end if;
end $$;

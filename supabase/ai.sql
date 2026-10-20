-- ═══════════════════════════════════════════════════════════════
-- hearme — AI選曲の回数制限（1人1日◯回）
-- SQL Editor に貼って Run（何度実行してもOK）
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  n       int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;   -- ポリシー無し＝アプリからは直接触れない

create or replace function public.bump_ai_usage(p_user uuid, p_limit int) returns int
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Tokyo')::date; cnt int;
begin
  insert into ai_usage(user_id, day, n) values (p_user, d, 1)
    on conflict (user_id, day) do update set n = ai_usage.n + 1
    returning n into cnt;
  if cnt > p_limit then
    raise exception 'AI_LIMIT' using hint = '今日のAI選曲は上限に達しました';
  end if;
  return cnt;
end $$;
revoke all on function public.bump_ai_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;

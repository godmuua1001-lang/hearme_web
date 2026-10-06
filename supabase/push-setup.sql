-- ═══════════════════════════════════════════════════════════════
-- hearme v7 — プッシュ通知の配線（schema.sql のあとに実行）
-- 下の2か所を書き換えてから Run:
--   <PROJECT_REF>  … Supabase の Project URL の https://XXXX.supabase.co の XXXX
--   <HEARME_SECRET> … Edge Function の Secrets に入れたのと同じ文字列
-- ═══════════════════════════════════════════════════════════════
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 設定値を保存（関数から読む）
create table if not exists private_config (key text primary key, value text not null);
alter table private_config enable row level security;   -- ポリシー無し＝アプリからは読めない
insert into private_config values
  ('push_url', 'https://<PROJECT_REF>.supabase.co/functions/v1/push'),
  ('secret',   '<HEARME_SECRET>')
on conflict (key) do update set value = excluded.value;

create or replace function public.call_push(payload jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url     := (select value from private_config where key = 'push_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-hearme-secret', (select value from private_config where key = 'secret')),
    body    := payload);
end $$;
revoke all on function public.call_push(jsonb) from public, anon, authenticated;

-- DMが届いたら通知
create or replace function public.tg_message_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.call_push(jsonb_build_object('kind', 'message', 'record', to_jsonb(new)));
  return new;
end $$;
drop trigger if exists message_push on public.messages;
create trigger message_push after insert on public.messages for each row execute function public.tg_message_push();

-- 毎時0分に tick（10〜22時のどこかで「hearmeの時間」が発火）
select cron.unschedule('hearme-tick') where exists (select 1 from cron.job where jobname = 'hearme-tick');
select cron.schedule('hearme-tick', '0 * * * *', $$ select public.call_push('{"kind":"tick"}'::jsonb) $$);

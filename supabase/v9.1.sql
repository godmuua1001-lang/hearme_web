-- ═══════════════════════════════════════════════════════════════
-- hearme v9.1 — 「聴かないと読めない」の抜け道をふさぐ
-- v9.sql の後に SQL Editor で Run（何度実行してもOK）
-- ひとこと（comment）を、テーブルの直接読み取りとリアルタイム配信から外す。
-- アプリは _post_json 経由（15秒聴いた人だけに返す）でのみ読む。
-- ═══════════════════════════════════════════════════════════════

-- ① REST から posts を直接 select しても comment 列は読めないようにする
revoke select on public.posts from anon, authenticated;
grant select (id, user_id, track_id, title, artist, artwork, preview_url, track_url,
              mood, mood_x, mood_y, is_public, on_time, created_at)
  on public.posts to authenticated;

-- ② リアルタイム配信は「新しい投稿があった」が分かれば十分（id と user_id だけ流す）
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime drop table public.posts; exception when others then null; end;
    alter publication supabase_realtime add table public.posts (id, user_id, created_at);
  end if;
end $$;

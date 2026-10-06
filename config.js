// ═══════════════════════════════════════════════════════════════
// hearme 設定
// Supabase ダッシュボード → Project Settings → API から2つをコピーして貼る。
// 空のままだと「デモモード」で動きます（データはこの端末だけ）。
// ※ anon key は公開して大丈夫な鍵です（service_role key は絶対に貼らないこと）
// ═══════════════════════════════════════════════════════════════
export const SUPABASE_URL = 'https://btxtfcqifovobifmvvrv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eHRmY3FpZm92b2JpZm12dnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTQ2MjQsImV4cCI6MjEwNjg3MDYyNH0.5B-5474j2FHqUB3MgLcMhiW-cp9ad9h8l9F3ZzJ2JE4';

// プッシュ通知用の公開鍵（そのままでOK）
export const VAPID_PUBLIC_KEY = 'BAWebhyt24AmDSzHo2PNMVp5G4QjeeYklBCLuZvtUdfGiSXtHnfzfAZq86IQvCHIyuty2dWXpTw6_fap6QgpPos';

// Googleログインを有効にしたら true に
export const GOOGLE_LOGIN = false;

# hearme v7

きもちを、音楽で届ける。今日の気分を1曲でシェアする、静かなSNS（PWA）。

- フロント：素のHTML/CSS/JS（ビルド不要）→ Vercel にそのまま配信
- サーバー：Supabase（DB・匿名ログイン・メールOTP・リアルタイム・Edge Function）
- 音楽：iTunes Search API（30秒試聴）/ Apple Music ランキング

## ファイル
| ファイル | 役割 |
|---|---|
| `index.html` / `styles.css` / `app.js` | 画面とUI |
| `api.js` | データ層（Supabase / デモモード） |
| `music.js` | 曲検索・ランキング・試聴プレイヤー |
| `config.js` | Supabase の URL と公開キー（空ならデモモード） |
| `sw.js` | オフライン起動・プッシュ通知 |
| `supabase/schema.sql` | DB・権限・関数（SQL Editor で実行） |
| `supabase/push-setup.sql` | 通知の配線（DM通知・毎日のhearmeの時間） |
| `supabase/functions/push/index.ts` | 通知を送る Edge Function |

## セットアップ状況
- [x] Supabase プロジェクト作成・`schema.sql` 実行・匿名ログインON
- [x] メールはSupabase標準（リンク方式）。URL Configuration の Site URL を本番URLに
- [ ] （任意）独自SMTP（Resend等）を設定 → テンプレートに `{{ .Token }}` を入れると6桁コードでもログイン可・送信上限も解除
- [ ] プッシュ通知：Edge Function `push` をデプロイ → Secrets 設定 → `push-setup.sql` 実行
- [ ] （任意）Googleログイン：Google Cloud で OAuth 作成 → Supabase に設定 → `config.js` の `GOOGLE_LOGIN = true`

## 安全設計
- DM はフレンド（招待コードを交換した相手）どうしのみ。DBのRLSで強制
- 「みんな」の投稿は匿名。作者IDは返さない（`public_feed()`）
- ブロック・通報・アカウント削除あり。投稿は1日3回まで

## 運用メモ（2026-10 セキュリティレビュー）
- `supabase/security.sql`：招待コード総当たり対策（失敗1時間10回まで）、画像URLをAppleの配信元に限定、アイコン形式の制限、DM添付サイズ制限
- `vercel.json`：セキュリティヘッダー（クリックジャッキング・MIME偽装対策など）
- **通報の確認**：Supabase → Table Editor → `reports` を定期的に見る（対応したら該当投稿を削除／ユーザーをBAN）
- **公開前にやること**：利用規約・プライバシーポリシー（AIにGemini無料枠を使う旨を明記）、匿名登録のCAPTCHA（Authentication → Attack Protection）
- AI選曲：`supabase/ai.sql` ＋ Edge Function `recommend`（Secrets: `GEMINI_API_KEY`、任意で `AI_PROVIDER=anthropic` ＋ `ANTHROPIC_API_KEY`）

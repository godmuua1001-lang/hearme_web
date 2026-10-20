// hearme recommend — 気分のひとことから、AIが曲を3つ提案する Edge Function
// 流れ：ログイン確認 → 回数制限 → AI（Gemini / Claude）に依頼 → iTunesで実在確認 → 返す
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const PROVIDER = (Deno.env.get("AI_PROVIDER") ?? "gemini").toLowerCase(); // "gemini" | "anthropic"
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? 10);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

type Idea = { title: string; artist: string; reason: string };

const SYSTEM = `あなたは日本の音楽にくわしい、やさしい選曲係です。
ユーザーの「今の気分」に寄り添う曲を3曲選びます。
ルール：
- 実在する曲だけを選ぶ（曲名とアーティスト名は正式表記で）
- 3曲はアーティストを分ける。J-POPを中心に、洋楽やインディーも1曲まで混ぜてよい
- reason は、その気分に寄り添う理由を25文字以内の日本語で、やさしい口調で
- 出力はJSONのみ：{"songs":[{"title":"","artist":"","reason":""}]}`;

// ── AI 呼び出し（差し替え可能） ──
async function askGemini(text: string): Promise<Idea[]> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const models = [Deno.env.get("GEMINI_MODEL"), "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean);
  let last = "";
  for (const m of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `今の気分：「${text}」` }] }],
        generationConfig: { temperature: 0.9, responseMimeType: "application/json", maxOutputTokens: 600 },
      }),
    });
    if (r.status === 404) { last = `model ${m} not found`; continue; }
    if (r.status === 429) throw new Error("AI_BUSY");
    if (!r.ok) { last = `gemini ${r.status} ${(await r.text()).slice(0, 200)}`; continue; }
    const d = await r.json();
    const out = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    return parseIdeas(out);
  }
  throw new Error(last || "gemini failed");
}

async function askClaude(text: string): Promise<Idea[]> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001",
      max_tokens: 600, temperature: 0.9, system: SYSTEM,
      messages: [{ role: "user", content: `今の気分：「${text}」` }],
    }),
  });
  if (r.status === 429) throw new Error("AI_BUSY");
  if (!r.ok) throw new Error(`claude ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return parseIdeas(d?.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "");
}

function parseIdeas(s: string): Idea[] {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]).songs;
    return Array.isArray(arr)
      ? arr.filter((x) => x?.title && x?.artist).slice(0, 5).map((x) => ({
          title: String(x.title).slice(0, 100), artist: String(x.artist).slice(0, 100), reason: String(x.reason ?? "").slice(0, 60),
        }))
      : [];
  } catch { return []; }
}

// ── iTunes で実在確認（AIの“でっちあげ曲”を除外） ──
const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[\s'’"“”・\-–—!！?？.,、。()（）]/g, "");
async function verify(i: Idea) {
  const q = new URLSearchParams({ term: `${i.title} ${i.artist}`, media: "music", entity: "song", limit: "8", country: "JP", lang: "ja_jp" });
  try {
    const r = await fetch(`https://itunes.apple.com/search?${q}`);
    const d = await r.json();
    const want = norm(i.artist);
    const hit = (d.results ?? []).find((t: Record<string, string>) => {
      const a = norm(t.artistName ?? "");
      return a.includes(want) || want.includes(a);
    });
    if (!hit) return null;
    return {
      track_id: hit.trackId, title: hit.trackName, artist: hit.artistName,
      artwork: hit.artworkUrl100 ? String(hit.artworkUrl100).replace("100x100bb", "600x600bb") : null,
      preview_url: hit.previewUrl ?? null, track_url: hit.trackViewUrl ?? null, reason: i.reason,
    };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // ログイン確認
  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json({ error: "NOT_SIGNED_IN" }, 401);

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().slice(0, 100);
  if (!text) return json({ error: "EMPTY" }, 400);

  // 1日の回数制限
  const { data: used, error: limErr } = await admin.rpc("bump_ai_usage", { p_user: u.user.id, p_limit: DAILY_LIMIT });
  if (limErr) return json({ error: limErr.message.includes("AI_LIMIT") ? "AI_LIMIT" : "USAGE_ERROR" }, limErr.message.includes("AI_LIMIT") ? 429 : 500);

  try {
    let ideas = PROVIDER === "anthropic" ? await askClaude(text) : await askGemini(text);
    let songs = (await Promise.all(ideas.map(verify))).filter(Boolean);
    // 実在する曲が少なければ1回だけ聞き直す
    if (songs.length < 2) {
      ideas = PROVIDER === "anthropic" ? await askClaude(text + "（有名で確実に実在する曲で）") : await askGemini(text + "（有名で確実に実在する曲で）");
      const more = (await Promise.all(ideas.map(verify))).filter(Boolean);
      const seen = new Set(songs.map((s) => s!.track_id));
      songs = songs.concat(more.filter((s) => !seen.has(s!.track_id)));
    }
    return json({ songs: songs.slice(0, 3), left: Math.max(0, DAILY_LIMIT - Number(used ?? 0)), provider: PROVIDER });
  } catch (e) {
    const msg = String((e as Error).message);
    console.error(msg);
    return json({ error: msg === "AI_BUSY" ? "AI_BUSY" : "AI_ERROR" }, msg === "AI_BUSY" ? 503 : 502);
  }
});

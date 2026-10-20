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
ユーザーの「今の気分」に寄り添う曲を6曲選びます（よく知られた、確実に実在する曲を優先）。
ルール：
- 実在する曲だけを選ぶ（曲名とアーティスト名は正式表記で）
- 6曲はアーティストを分ける。J-POPを中心に、洋楽やインディーも1曲まで混ぜてよい
- reason は、その気分に寄り添う理由を25文字以内の日本語で、やさしい口調で
- 出力はJSONのみ：{"songs":[{"title":"","artist":"","reason":""}]}`;

// ── AI 呼び出し（差し替え可能） ──
async function askGemini(text: string): Promise<Idea[]> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  // 速さ優先：まず軽量モデル（flash-lite）、だめなら flash
  const models = [Deno.env.get("GEMINI_MODEL"), "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean) as string[];
  let last = "";
  for (const m of models) {
    // 選曲に「考える時間」は不要なので thinking をオフにして速くする（未対応モデルなら外して再試行）
    let r: Response | null = null;
    for (const noThink of [true, false]) {
      const generationConfig: Record<string, unknown> = { temperature: 0.9, responseMimeType: "application/json", maxOutputTokens: 700 };
      if (noThink) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: `今の気分：「${text}」` }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(9000),
      }).catch(() => null);
      if (!r) break;
      if (r.status !== 400) break;
    }
    if (!r) continue;
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
      max_tokens: 900, temperature: 0.9, system: SYSTEM,
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
      ? arr.filter((x) => x?.title && x?.artist).slice(0, 6).map((x) => ({
          title: String(x.title).slice(0, 100), artist: String(x.artist).slice(0, 100), reason: String(x.reason ?? "").slice(0, 60),
        }))
      : [];
  } catch { return []; }
}

const RECAP_SYSTEM = `あなたは、ユーザーの1ヶ月の「気分と曲の記録」をやさしくふり返る相棒です。
出力はJSONのみ：{"title":"","summary":"","word":""}
- title：その月を表す短いタイトル（12文字以内、例「雨のち、少し晴れ」）
- summary：気分の流れと曲の傾向を、あたたかく2〜3文（120文字以内）。否定や診断はしない
- word：来月の自分へのひとこと（25文字以内）`;
async function recap(list: string) {
  const prompt = `今月の記録：\n${list}`;
  let raw = "";
  if (PROVIDER === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001", max_tokens: 500, system: RECAP_SYSTEM, messages: [{ role: "user", content: prompt }] }),
    });
    if (r.status === 429) throw new Error("AI_BUSY");
    raw = (await r.json())?.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
  } else {
    const key = Deno.env.get("GEMINI_API_KEY") ?? "";
    for (const m of [Deno.env.get("GEMINI_MODEL"), "gemini-2.5-flash", "gemini-flash-latest"].filter(Boolean)) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: RECAP_SYSTEM }] }, contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, responseMimeType: "application/json", maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } } }),
      });
      if (r.status === 429) throw new Error("AI_BUSY");
      if (!r.ok) continue;
      raw = (await r.json())?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      break;
    }
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI_ERROR");
  const j = JSON.parse(m[0]);
  return { title: String(j.title ?? "").slice(0, 20), summary: String(j.summary ?? "").slice(0, 160), word: String(j.word ?? "").slice(0, 40) };
}

// ── iTunes で実在確認（AIの“でっちあげ曲”を除外） ──
const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[\s'’"“”・\-–—!！?？.,、。()（）]/g, "");
async function verify(i: Idea) {
  const q = new URLSearchParams({ term: `${i.title} ${i.artist}`, media: "music", entity: "song", limit: "8", country: "JP", lang: "ja_jp" });
  try {
    const r = await fetch(`https://itunes.apple.com/search?${q}`, { signal: AbortSignal.timeout(3500) });
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

// 一時的な失敗（混雑・JSON崩れ）は1回だけ自動で再試行
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ask(text: string): Promise<Idea[]> {
  for (let i = 0; i < 2; i++) {
    try {
      const ideas = PROVIDER === "anthropic" ? await askClaude(text) : await askGemini(text);
      if (ideas.length) return ideas;
    } catch (e) {
      if (i === 1) throw e;
      if ((e as Error).message === "AI_BUSY") await sleep(1500);
    }
  }
  return [];
}
// 同じアーティストは1曲まで
function uniq<T extends { track_id: number; artist: string }>(list: (T | null)[]): T[] {
  const ids = new Set<number>(), artists = new Set<string>();
  return (list.filter(Boolean) as T[]).filter((s) => {
    const a = norm(s.artist);
    if (ids.has(s.track_id) || artists.has(a)) return false;
    ids.add(s.track_id); artists.add(a); return true;
  });
}

// 6曲を同時に確認し、3曲そろった時点で（残りを待たずに）返す
function verifyFast(ideas: Idea[]): Promise<NonNullable<Awaited<ReturnType<typeof verify>>>[]> {
  return new Promise((resolve) => {
    const got: (Awaited<ReturnType<typeof verify>>)[] = []; let done = 0;
    if (!ideas.length) return resolve([]);
    ideas.forEach((i, k) => verify(i).then((v) => {
      got[k] = v; done++;
      const ok = uniq(got.filter(Boolean) as NonNullable<typeof v>[]);
      // 先に並んでいる候補を優先：上位から3曲そろったら即返す
      const prefixDone = ideas.slice(0, Math.min(ideas.length, 4)).every((_, j) => j in got);
      if ((ok.length >= 3 && prefixDone) || done === ideas.length) resolve(ok);
    }));
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // ログイン確認
  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json({ error: "NOT_SIGNED_IN" }, 401);

  const body = await req.json().catch(() => ({}));

  // ── ④ 月末の「きもちの記録」：1ヶ月の気分と曲から、やさしいふり返りを書く ──
  if (body.mode === "recap") {
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 90)
      .map((x: Record<string, unknown>) => `${String(x.day ?? "").slice(0, 10)} ${String(x.mood ?? "").slice(0, 12)} 「${String(x.title ?? "").slice(0, 60)}」${String(x.artist ?? "").slice(0, 40)}`);
    if (!items.length) return json({ error: "EMPTY" }, 400);
    const { error: le } = await admin.rpc("bump_ai_usage", { p_user: u.user.id, p_limit: DAILY_LIMIT });
    if (le) return json({ error: le.message.includes("AI_LIMIT") ? "AI_LIMIT" : "USAGE_ERROR" }, le.message.includes("AI_LIMIT") ? 429 : 500);
    try {
      const out = await recap(items.join("\n"));
      return json(out);
    } catch (e) {
      await admin.rpc("refund_ai_usage", { p_user: u.user.id }).then(() => {}, () => {});
      return json({ error: (e as Error).message === "AI_BUSY" ? "AI_BUSY" : "AI_ERROR" }, 502);
    }
  }

  const text = String(body.text ?? "").trim().slice(0, 100);
  if (!text) return json({ error: "EMPTY" }, 400);

  // 1日の回数制限
  const { data: used, error: limErr } = await admin.rpc("bump_ai_usage", { p_user: u.user.id, p_limit: DAILY_LIMIT });
  if (limErr) return json({ error: limErr.message.includes("AI_LIMIT") ? "AI_LIMIT" : "USAGE_ERROR" }, limErr.message.includes("AI_LIMIT") ? 429 : 500);

  try {
    let songs = await verifyFast(await ask(text));
    // 1曲も実在確認できなかったときだけ聞き直す（待ち時間を短くするため）
    if (!songs.length) songs = await verifyFast(await ask(text + "（有名で確実に実在する曲で）"));
    if (!songs.length) throw new Error("NO_SONGS");
    return json({ songs: songs.slice(0, 3), left: Math.max(0, DAILY_LIMIT - Number(used ?? 0)), provider: PROVIDER });
  } catch (e) {
    const msg = String((e as Error).message);
    console.error(msg);
    // 失敗した回は回数に数えない
    await admin.rpc("refund_ai_usage", { p_user: u.user.id }).then(() => {}, () => {});
    return json({ error: msg === "AI_BUSY" ? "AI_BUSY" : "AI_ERROR" }, msg === "AI_BUSY" ? 503 : 502);
  }
});

// hearme push — Supabase Edge Function
// 1) DMが届いたら相手のiPhone/Androidに通知
// 2) 毎時呼ばれ、今日の「hearmeタイム」になったら全員に通知
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = Deno.env.get("HEARME_SECRET")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@hearme.app",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type Sub = { endpoint: string; p256dh: string; auth: string };

async function send(subs: Sub[], payload: Record<string, unknown>) {
  const dead: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 30, urgency: "high" },
      );
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);
    }
  }));
  if (dead.length) await sb.from("push_subscriptions").delete().in("endpoint", dead);
  return subs.length - dead.length;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-hearme-secret") !== SECRET) return new Response("forbidden", { status: 403 });
  const body = await req.json().catch(() => ({}));

  // ── 毎時の tick ──
  if (body.kind === "tick") {
    const { data: m } = await sb.rpc("ensure_moment");
    if (!m?.fired) return Response.json({ fired: false });
    let sent = 0, from = 0;
    for (;;) {
      const { data: subs } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth")
        .eq("daily", true).range(from, from + 499);
      if (!subs?.length) break;
      sent += await send(subs, {
        title: "🎧 hearmeの時間！",
        body: "今の気分を1曲で。10分以内にシェアしよう",
        url: "/?moment=1", tag: "hearme-moment",
      });
      if (subs.length < 500) break;
      from += 500;
    }
    return Response.json({ fired: true, sent });
  }

  // ── 新しいDM ──
  if (body.kind === "message" && body.record) {
    const r = body.record;
    const [{ data: sender }, { data: subs }] = await Promise.all([
      sb.from("profiles").select("name,emoji").eq("id", r.sender).single(),
      sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", r.receiver),
    ]);
    if (!subs?.length) return Response.json({ sent: 0 });
    const song = r.song as { title?: string; artist?: string; reaction?: string } | null;
    const text = song?.reaction
      ? `${song.reaction} あなたの「${song.title ?? "投稿"}」にリアクション`
      : song?.title ? `🎵 ${song.title}${song.artist ? " / " + song.artist : ""}${r.body ? "\n" + r.body : ""}`
      : r.body;
    const sent = await send(subs, {
      title: `${sender?.emoji ?? "🎧"} ${sender?.name ?? "フレンド"}`,
      body: String(text).slice(0, 140),
      url: `/?dm=${r.sender}`, tag: `dm-${r.sender}`,
    });
    return Response.json({ sent });
  }
  return Response.json({ ok: true });
});

// Edge Function weekly-digest: раз в неделю письмо клиенту с итогами недели по объекту.
// Дёргается расписанием pg_cron (см. миграцию weekly_digest_cron). Письмо через Resend.
// Секрет RESEND_KEY; SUPABASE_URL/SERVICE_ROLE_KEY Supabase подставляет сам.
// Деплой с --no-verify-jwt (cron зовёт без Authorization).
// ВАЖНО: from=onboarding@resend.dev шлёт только на почту владельца Resend. Для реальных
// клиентов — подтвердить домен tr-estate.ru в Resend и сменить from на noreply@tr-estate.ru.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://tr-estate.ru";
const FROM = "Transparency Estate <onboarding@resend.dev>";

const plural = (n: number, a: string, b: string, c: string) => {
  const d = n % 10, dd = n % 100;
  return d === 1 && dd !== 11 ? a : (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) ? b : c;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: objs } = await sb.from("objects")
    .select("id, name, client_email, share_token, status, notif_settings, feed_entries(created_at, photos, body, client_state)")
    .not("client_email", "is", null);

  let sent = 0, skipped = 0;
  for (const o of objs ?? []) {
    if (!o.client_email || !o.share_token) { skipped++; continue; }
    // Сводка отчётов — только если «report» на еженедельной периодичности.
    const rep = (o as any).notif_settings?.report;
    const wantReport = rep ? (rep.on !== false && rep.freq === "weekly") : false;
    const week = wantReport ? (o.feed_entries ?? []).filter((f: any) => f.client_state === "approved" && f.created_at > weekAgo) : [];
    // Одобренные еженедельные уведомления событий (этап/срок/документ/эфир/уход), ещё не отправленные.
    const { data: notifs } = await sb.from("client_notifications")
      .select("id, title, body").eq("object_id", (o as any).id).eq("state", "approved").eq("freq", "weekly").is("sent_at", null);
    const events = notifs ?? [];
    if (!week.length && !events.length) { skipped++; continue; } // нечего слать

    let items = "";
    if (week.length) {
      const photos = week.reduce((n: number, f: any) => n + ((f.photos ?? []).length), 0);
      const last = [...week].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];
      items += `<li>${week.length} ${plural(week.length, "обновление", "обновления", "обновлений")}${photos ? `, ${photos} ${plural(photos, "новое фото", "новых фото", "новых фото")}` : ""}</li>`;
      if (last.body) items += `<li style="color:#555">Последнее: «${esc(last.body)}»</li>`;
    }
    for (const ev of events) items += `<li><b>${esc(ev.title ?? "")}</b> — ${esc(ev.body ?? "")}</li>`;

    const url = `${APP_URL}/share.html?t=${o.share_token}`;
    const html = `<div style="font-family:-apple-system,Arial,sans-serif;color:#2b2b29;line-height:1.5">
      <p>Здравствуйте!</p>
      <p>Итоги недели на вашем объекте «${esc(o.name)}»:</p>
      <ul style="padding-left:18px">${items}</ul>
      <p><a href="${url}" style="display:inline-block;background:#6b7257;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none">Посмотреть, как растёт ваш сад →</a></p>
      <p style="color:#8a8782;font-size:13px;margin-top:24px">Transparency Estate · еженедельная сводка</p>
    </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + Deno.env.get("RESEND_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: o.client_email, subject: `За неделю на объекте «${o.name}»`, html }),
    });
    if (r.ok) {
      sent++;
      if (events.length) await sb.from("client_notifications").update({ state: "sent", sent_at: new Date().toISOString() }).in("id", events.map((e: any) => e.id));
    } else skipped++;
  }
  return new Response(JSON.stringify({ sent, skipped }), { status: 200, headers: { "content-type": "application/json" } });
});

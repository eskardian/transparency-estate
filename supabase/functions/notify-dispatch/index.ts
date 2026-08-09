// Edge Function notify-dispatch: рассылка клиентских уведомлений по событиям.
// Дёргается триггером trg_dispatch_notif (client_notifications).
//  - state=approved & freq=instant → письмо клиенту (Resend), помечаем sent.
//  - state=pending → запрос подтверждения менеджеру в Telegram (в приложении — колокольчик).
// Секреты: RESEND_KEY, TG_BOT_TOKEN, TG_CHAT_KAMPIKA, TG_CHAT_ZELEGE. Деплой с --no-verify-jwt.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://tr-estate.ru";
const FROM = "Transparency Estate <onboarding@resend.dev>";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const { record } = await req.json().catch(() => ({} as any));
  if (!record?.object_id) return new Response("skip", { status: 200 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: o } = await sb.from("objects")
    .select("name, company, client_email, share_token").eq("id", record.object_id).maybeSingle();
  if (!o) return new Response("skip", { status: 200 });

  // Запрос подтверждения менеджеру
  if (record.state === "pending") {
    const chat = o.company === "zelege" ? Deno.env.get("TG_CHAT_ZELEGE") : Deno.env.get("TG_CHAT_KAMPIKA");
    if (chat) {
      const text = `Уведомление клиенту ждёт подтверждения — объект «${o.name}»:\n${record.title}. ${record.body}\n` +
        `Открой приложение → колокольчик, чтобы отправить: ${APP_URL}/?obj=${record.object_id}`;
      await fetch(`https://api.telegram.org/bot${Deno.env.get("TG_BOT_TOKEN")}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
      });
    }
    return new Response("pending→manager", { status: 200 });
  }

  // Отправка клиенту (approved + instant)
  if (record.state === "approved" && record.freq === "instant") {
    if (!o.client_email || !o.share_token) {
      await sb.from("client_notifications").update({ state: "skipped", sent_at: new Date().toISOString() }).eq("id", record.id);
      return new Response("no client", { status: 200 });
    }
    const url = `${APP_URL}/share.html?t=${o.share_token}`;
    const html = `<div style="font-family:-apple-system,Arial,sans-serif;color:#2b2b29;line-height:1.5">
      <p>Здравствуйте!</p>
      <p><b>${record.title}</b> — ${record.body}</p>
      <p><a href="${url}" style="display:inline-block;background:#6b7257;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none">Открыть портал объекта →</a></p>
      <p style="color:#8a8782;font-size:13px;margin-top:24px">Transparency Estate</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + Deno.env.get("RESEND_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: o.client_email, subject: `${record.title} · «${o.name}»`, html }),
    });
    await sb.from("client_notifications").update({ state: "sent", sent_at: new Date().toISOString() }).eq("id", record.id);
    return new Response(await r.text(), { status: 200 });
  }

  return new Response("skip", { status: 200 });
});

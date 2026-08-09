// Edge Function notify-client: письмо клиенту при согласованном обновлении объекта.
// Дёргается триггером trg_notify_client (feed_entries → approved). Письмо через Resend.
// Секрет: RESEND_KEY. SUPABASE_URL/SERVICE_ROLE_KEY Supabase подставляет сам.
// ВАЖНО: from=onboarding@resend.dev шлёт только на почту владельца Resend. Для реальных
// клиентов — подтвердить домен tr-estate.ru в Resend и сменить from на noreply@tr-estate.ru.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://tr-estate.ru";
const FROM = "Transparency Estate <onboarding@resend.dev>";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const payload = await req.json().catch(() => ({}));
  const record = payload.record;
  if (!record?.object_id || record.client_state !== "approved") return new Response("skip", { status: 200 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: obj } = await sb.from("objects")
    .select("name, client_email, share_token, notif_settings").eq("id", record.object_id).maybeSingle();
  if (!obj?.client_email || !obj.share_token) return new Response("skip", { status: 200 });
  // Настройки уведомлений (событие «report»): шлём сразу только при on && freq='instant'.
  const rep = obj.notif_settings?.report;
  if (rep && (rep.on === false || rep.freq !== "instant")) return new Response("skip: settings", { status: 200 });

  const url = `${APP_URL}/share.html?t=${obj.share_token}`;
  const html = `<div style="font-family:-apple-system,Arial,sans-serif;color:#2b2b29;line-height:1.5">
    <p>Здравствуйте!</p>
    <p>На вашем объекте «${obj.name}» появилось новое обновление — свежие фото и ход работ.</p>
    <p><a href="${url}" style="display:inline-block;background:#6b7257;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none">Посмотреть, как растёт ваш сад →</a></p>
    <p style="color:#8a8782;font-size:13px;margin-top:24px">Transparency Estate</p>
  </div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + Deno.env.get("RESEND_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: obj.client_email, subject: `Обновление по объекту «${obj.name}»`, html }),
  });
  return new Response(await r.text(), { status: 200 });
});

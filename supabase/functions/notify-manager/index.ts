// Edge Function: уведомление менеджеру о новом отчёте, ждущем согласования.
// Замена Netlify-функции. Дёргается database webhook (INSERT в feed_entries).
// Секреты (Supabase → Edge Functions → Secrets): TG_BOT_TOKEN, TG_CHAT_KAMPIKA, TG_CHAT_ZELEGE.
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// Деплой: supabase functions deploy notify-manager --project-ref pqmjulphghojlaijffty
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://tr-estate.ru";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const payload = await req.json().catch(() => ({}));
  const record = payload.record;
  if (!record?.object_id) return new Response("skip", { status: 200 });
  // только записи, ждущие согласования
  if (record.client_state && record.client_state !== "pending") return new Response("skip", { status: 200 });

  // имя объекта читаем сервисным ключом в обход RLS
  let obj: { name?: string; company?: string } | null = null;
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await sb.from("objects").select("name, company").eq("id", record.object_id).maybeSingle();
    obj = data;
  } catch (_e) { /* имя — украшение; шлём и без него */ }

  const chat = obj?.company === "zelege"
    ? Deno.env.get("TG_CHAT_ZELEGE")
    : Deno.env.get("TG_CHAT_KAMPIKA");
  if (!chat) return new Response("no chat configured", { status: 200 });

  const name = obj?.name ? `«${obj.name}»` : "#" + record.object_id;
  const text = `Новый отчёт по объекту ${name} ждёт согласования.\n` +
    `Открой и реши, показывать ли клиенту: ${APP_URL}/?obj=${record.object_id}`;

  await fetch(`https://api.telegram.org/bot${Deno.env.get("TG_BOT_TOKEN")}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
  return new Response("ok", { status: 200 });
});

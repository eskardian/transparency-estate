// notify-manager — Supabase DB Webhook (INSERT в feed_entries) → Telegram менеджеру компании.
// Настройка: Supabase → Database → Webhooks → INSERT on feed_entries →
//   POST https://stellular-crostata-c4fb1c.netlify.app/.netlify/functions/notify-manager
//   + HTTP-заголовок x-webhook-secret = значение WEBHOOK_SECRET.
// ENV (Netlify → Site settings → Environment variables):
//   TG_BOT_TOKEN        — токен бота (@BotFather)
//   TG_CHAT_KAMPIKA     — chat_id менеджера Kampika (Варвара)
//   TG_CHAT_ZELEGE      — chat_id менеджера Zelege (Станислав)
//   SUPABASE_URL, SUPABASE_SERVICE_KEY — для чтения имени объекта в обход RLS (только на сервере!)
//   WEBHOOK_SECRET      — общий секрет с вебхуком

const APP_URL = 'https://stellular-crostata-c4fb1c.netlify.app';

export default async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  // секрет проверяем только если задан (MVP низкого риска — без него; включить при хардненинге)
  if (process.env.WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== process.env.WEBHOOK_SECRET)
    return new Response('forbidden', { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const record = payload.record;
  if (!record || !record.object_id) return new Response('skip', { status: 200 });
  // уведомляем только о записях, ждущих согласования
  if (record.client_state && record.client_state !== 'pending') return new Response('skip', { status: 200 });

  let obj = null;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/objects?id=eq.${record.object_id}&select=name,company`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY,
                 authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY }
    });
    [obj] = await r.json();
  } catch (e) { /* имя объекта — украшение; шлём уведомление и без него */ }

  const chat = obj && obj.company === 'zelege' ? process.env.TG_CHAT_ZELEGE : process.env.TG_CHAT_KAMPIKA;
  if (!chat) return new Response('no chat configured', { status: 200 });

  const name = obj && obj.name ? `«${obj.name}»` : '#' + record.object_id;
  const text = `Новый отчёт по объекту ${name} ждёт согласования.\n` +
               `Открой и реши, показывать ли клиенту: ${APP_URL}/?obj=${record.object_id}`;
  await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text })
  });
  return new Response('ok', { status: 200 });
};

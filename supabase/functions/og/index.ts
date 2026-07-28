// Edge Function og: красивое превью ссылки портала в мессенджерах.
// Краулер (Telegram/WhatsApp/…) получает OG-теги с обложкой и названием ИМЕННО этого объекта;
// человек мгновенно редиректится на портал. Проксируется nginx-ом на tr-estate.ru/o?t=…
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP = "https://tr-estate.ru";
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") || "";
  const target = `${APP}/share.html?t=${encodeURIComponent(token)}`;
  let name = "Ваш объект", cover = `${APP}/icon-512.png`;

  if (token) {
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await sb.from("objects").select("name, cover_url").eq("share_token", token).maybeSingle();
      if (data) { name = data.name || name; if (data.cover_url) cover = data.cover_url; }
    } catch (_e) { /* превью-украшение: при сбое отдаём дефолт */ }
  }

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${esc(name)} — Transparency Estate</title>
<meta property="og:title" content="${esc(name)} — ход работ">
<meta property="og:description" content="Следите за прогрессом вашего объекта: фото, план работ и статус в реальном времени.">
<meta property="og:image" content="${esc(cover)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(target)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)})</script>
</head><body style="font-family:-apple-system,sans-serif;padding:40px;text-align:center;color:#8a8782">Открываем объект…</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
});

// Edge Function sign-doc: анонимный клиент портала скачивает документ по share-токену.
// Валидирует, что документ принадлежит объекту с этим токеном и помечен client_visible,
// затем подписывает ссылку на приватный бакет docs. Деплой: --no-verify-jwt.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const { token, doc_id } = await req.json().catch(() => ({}));
  if (!token || !doc_id) return json({ error: "bad request" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: doc } = await sb
    .from("object_documents")
    .select("path, client_visible, objects!inner(share_token)")
    .eq("id", doc_id)
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const shareToken = (doc as any)?.objects?.share_token;
  if (!doc || !doc.client_visible || shareToken !== token) return json({ error: "not allowed" }, 403);

  const { data: signed, error } = await sb.storage.from("docs").createSignedUrl(doc.path, 300);
  if (error) return json({ error: error.message }, 500);
  return json({ url: signed.signedUrl });
});

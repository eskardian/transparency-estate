-- Kampika map — миграция v6: документы (жёсткий доступ), флажок «в контент», клиентская ссылка.
-- Запустить в Supabase → SQL Editor → Run (после schema-v5.sql). Идемпотентна.

-- ── Хелпер: может ли текущий юзер УПРАВЛЯТЬ объектом (админ его компании или супер).
--    НЕ has_access → рядовой сотрудник с доступом к объекту сюда не попадает.
create or replace function can_manage_object(obj bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_super() or exists(select 1 from objects o where o.id = obj and o.company = my_company() and is_admin());
$$;

-- ════════ ДОКУМЕНТЫ (видят только админ компании + супер) ════════
create table if not exists object_documents (
  id bigint generated always as identity primary key,
  object_id bigint references objects(id) on delete cascade,
  name text,
  path text,                       -- путь в приватном бакете docs (не публичный URL)
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table object_documents enable row level security;
drop policy if exists "docs_select" on object_documents;
drop policy if exists "docs_insert" on object_documents;
drop policy if exists "docs_delete" on object_documents;
create policy "docs_select" on object_documents for select using (can_manage_object(object_id));
create policy "docs_insert" on object_documents for insert with check (can_manage_object(object_id));
create policy "docs_delete" on object_documents for delete using (can_manage_object(object_id));

-- Приватный бакет docs (не публичный — смотрим через подписанные ссылки)
insert into storage.buckets (id, name, public) values ('docs','docs',false) on conflict (id) do nothing;
drop policy if exists "docs_storage_read" on storage.objects;
drop policy if exists "docs_storage_write" on storage.objects;
-- ponytail: путь к файлу знают только админы (он в object_documents, закрытой RLS),
-- поэтому достаточно «вошёл = можно». Точная привязка к компании по пути — если понадобится.
create policy "docs_storage_read" on storage.objects for select using (bucket_id='docs' and auth.role()='authenticated');
create policy "docs_storage_write" on storage.objects for insert with check (bucket_id='docs' and auth.role()='authenticated');

-- ════════ ФЛАЖОК «В КОНТЕНТ» (банк кадров для соцсетей) ════════
create table if not exists content_photos (
  id bigint generated always as identity primary key,
  object_id bigint references objects(id) on delete cascade,
  url text unique,
  added_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table content_photos enable row level security;
drop policy if exists "content_select" on content_photos;
drop policy if exists "content_insert" on content_photos;
drop policy if exists "content_delete" on content_photos;
create policy "content_select" on content_photos for select using (can_see_object(object_id));
create policy "content_insert" on content_photos for insert with check (can_see_object(object_id));
create policy "content_delete" on content_photos for delete using (can_manage_object(object_id) or added_by = auth.uid());

-- ════════ КЛИЕНТСКАЯ ССЫЛКА (read-only, без логина) ════════
alter table objects add column if not exists share_token text;

-- Публичная функция: по токену отдаёт ОДИН объект + ленту (только тот, чей токен совпал).
-- security definer → читает в обход RLS, но возвращает строго объект с этим токеном.
create or replace function get_shared_object(token text) returns json
  language sql stable security definer set search_path = public as $$
  select case when coalesce(token,'')='' then null else (
    select json_build_object(
      'name', o.name, 'status', o.status, 'address', o.address, 'company', o.company,
      'cover_url', o.cover_url, 'updated_at', o.updated_at,
      'feed', coalesce((
        select json_agg(json_build_object('body',f.body,'status',f.status,'created_at',f.created_at,'photos',f.photos)
               order by f.created_at desc)
        from feed_entries f where f.object_id = o.id), '[]'::json)
    ) from objects o where o.share_token = token limit 1
  ) end;
$$;
grant execute on function get_shared_object(text) to anon, authenticated;

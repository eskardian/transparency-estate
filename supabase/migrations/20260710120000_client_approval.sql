-- Kampika map — миграция v7: согласование отчётов менеджером перед показом клиенту.
-- Запустить в Supabase → SQL Editor → Run (после schema-v6.sql). Идемпотентна.

-- ── Статус записи для клиента: pending (ждёт согласования) / approved / hidden.
--    Бэкфилл только при первом прогоне: старые записи клиент уже видел — считаем согласованными.
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_name='feed_entries' and column_name='client_state') then
    alter table feed_entries add column client_state text not null default 'pending'
      check (client_state in ('pending','approved','hidden'));
    update feed_entries set client_state = 'approved';
  end if;
end $$;

-- ── Менять статус (и вообще редактировать записи) может админ компании или супер.
drop policy if exists "feed_update_manage" on feed_entries;
create policy "feed_update_manage" on feed_entries
  for update using (can_manage_object(object_id));

-- ── Клиентский портал видит только согласованные записи.
create or replace function get_shared_object(token text) returns json
  language sql stable security definer set search_path = public as $$
  select case when coalesce(token,'')='' then null else (
    select json_build_object(
      'name', o.name, 'status', o.status, 'address', o.address, 'company', o.company,
      'cover_url', o.cover_url, 'updated_at', o.updated_at,
      'lat', o.lat, 'lon', o.lon,
      'feed', coalesce((
        select json_agg(json_build_object('body',f.body,'status',f.status,'created_at',f.created_at,'photos',f.photos)
               order by f.created_at desc)
        from feed_entries f where f.object_id = o.id and f.client_state = 'approved'), '[]'::json)
    ) from objects o where o.share_token = token limit 1
  ) end;
$$;
grant execute on function get_shared_object(text) to anon, authenticated;

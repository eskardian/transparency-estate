-- Дорожная карта: план-даты по этапам. jsonb-карта {этап → дата ISO}. Идемпотентна.
alter table objects add column if not exists stage_dates jsonb not null default '{}'::jsonb;

-- RPC портала: отдаём stage_dates (веха/роадмэп у клиента). Остальное сохранено.
create or replace function get_shared_object(token text) returns json
  language sql stable security definer set search_path = public as $$
  select case when coalesce(token,'')='' then null else (
    select json_build_object(
      'name', o.name, 'status', o.status, 'address', o.address, 'company', o.company,
      'cover_url', o.cover_url, 'updated_at', o.updated_at, 'lat', o.lat, 'lon', o.lon,
      'due_date', o.due_date, 'stage_dates', o.stage_dates,
      'manager_tg', o.manager_tg,
      'support_tg', c.support_tg, 'support_url', c.support_url, 'bot_username', c.bot_username,
      'feed', coalesce((
        select json_agg(json_build_object('body',f.body,'status',f.status,'created_at',f.created_at,'photos',f.photos)
               order by f.created_at desc)
        from feed_entries f where f.object_id = o.id and f.client_state = 'approved'), '[]'::json)
    )
    from objects o left join companies c on c.slug = o.company
    where o.share_token = token limit 1
  ) end;
$$;
grant execute on function get_shared_object(text) to anon, authenticated;

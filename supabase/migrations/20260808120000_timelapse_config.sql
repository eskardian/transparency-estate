-- Сборка таймлапса (экран 7g): менеджер курирует кадры/порядок/скорость.
-- Конфиг на объекте: { frames: [{url, date}], speed: 'slow'|'normal'|'fast' }. null → авто (все фото).
alter table objects add column if not exists timelapse jsonb;

-- RPC портала: + timelapse (портал играет собранный вариант, если задан).
create or replace function get_shared_object(token text) returns json
  language sql stable security definer set search_path = public as $$
  select case when coalesce(token,'')='' then null else (
    select json_build_object(
      'name', o.name, 'status', o.status, 'address', o.address, 'company', o.company,
      'cover_url', o.cover_url, 'updated_at', o.updated_at, 'lat', o.lat, 'lon', o.lon,
      'due_date', o.due_date, 'stage_dates', o.stage_dates, 'live_url', o.live_url, 'care', o.care,
      'manager_tg', o.manager_tg, 'timelapse', o.timelapse,
      'support_tg', c.support_tg, 'support_url', c.support_url, 'bot_username', c.bot_username,
      'brand_color', c.brand_color, 'logo_url', c.logo_url, 'display_name', c.display_name,
      'docs', coalesce((select json_agg(json_build_object('id', d.id, 'name', d.name) order by d.created_at)
                from object_documents d where d.object_id = o.id and d.client_visible = true), '[]'::json),
      'feed', coalesce((
        select json_agg(json_build_object(
                 'id', f.id, 'body', f.body, 'status', f.status, 'created_at', f.created_at, 'photos', f.photos,
                 'reactions', coalesce((select json_object_agg(emoji, cnt)
                   from (select emoji, count(*) cnt from feed_reactions where feed_id = f.id group by emoji) r), '{}'::json))
               order by f.created_at desc)
        from feed_entries f where f.object_id = o.id and f.client_state = 'approved'), '[]'::json)
    )
    from objects o left join companies c on c.slug = o.company
    where o.share_token = token limit 1
  ) end;
$$;
grant execute on function get_shared_object(text) to anon, authenticated;

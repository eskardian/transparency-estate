-- Реакции клиента на обновления: клиент из портала ставит эмодзи, менеджер видит счётчики.
-- Идемпотентна.

create table if not exists feed_reactions (
  id bigint generated always as identity primary key,
  feed_id bigint references feed_entries(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now()
);
create index if not exists feed_reactions_feed_idx on feed_reactions(feed_id);
alter table feed_reactions enable row level security;
-- Читать счётчики может любой вошедший (менеджеру для панели). Вставка — только через RPC (security definer).
drop policy if exists "reactions_select" on feed_reactions;
create policy "reactions_select" on feed_reactions for select using (auth.role() = 'authenticated');

-- Анонимный клиент ставит реакцию по share-токену (RPC валидирует принадлежность и эмодзи).
create or replace function react_shared(token text, fid bigint, emo text) returns json
  language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
  if emo not in ('👍','❤️','🔥') then return json_build_object('error','bad emoji'); end if;
  select exists(
    select 1 from feed_entries f join objects o on o.id = f.object_id
    where f.id = fid and o.share_token = token and f.client_state = 'approved'
  ) into allowed;
  if not allowed then return json_build_object('error','not allowed'); end if;
  insert into feed_reactions(feed_id, emoji) values (fid, emo);
  return json_build_object('count', (select count(*) from feed_reactions where feed_id = fid and emoji = emo));
end $$;
grant execute on function react_shared(text, bigint, text) to anon, authenticated;

-- RPC портала: в каждую запись ленты добавляем id и агрегат реакций {эмодзи: число}.
create or replace function get_shared_object(token text) returns json
  language sql stable security definer set search_path = public as $$
  select case when coalesce(token,'')='' then null else (
    select json_build_object(
      'name', o.name, 'status', o.status, 'address', o.address, 'company', o.company,
      'cover_url', o.cover_url, 'updated_at', o.updated_at, 'lat', o.lat, 'lon', o.lon,
      'due_date', o.due_date, 'stage_dates', o.stage_dates, 'live_url', o.live_url,
      'manager_tg', o.manager_tg,
      'support_tg', c.support_tg, 'support_url', c.support_url, 'bot_username', c.bot_username,
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

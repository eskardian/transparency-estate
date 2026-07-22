-- v8 (этап 2A): мультитенантность — компании как данные + персональный менеджер объекта.
-- Заменяет хардкод TG_MANAGER в коде. Идемпотентна. Автонакат при push (Supabase↔GitHub).

-- ════════ КОМПАНИИ (тенанты) ════════
create table if not exists companies (
  slug text primary key,
  name text not null,
  support_tg text,        -- контакт поддержки: @username или t.me-ссылка (Окно 2, всегда есть)
  support_url text,       -- запасной канал поддержки (форма/сайт)
  bot_username text,      -- будущий бот компании с очередью (Окно 1 fallback)
  created_at timestamptz default now()
);
insert into companies (slug, name) values ('kampika','Kampika'), ('zelege','Zelege')
  on conflict (slug) do nothing;

alter table companies enable row level security;
drop policy if exists "companies_select" on companies;
drop policy if exists "companies_update" on companies;
-- читать список компаний может любой вошедший (нужно фронту); анон читает через RPC (security definer)
create policy "companies_select" on companies for select using (auth.role() = 'authenticated');
-- править: супер-админ — любую; админ компании — только свою строку
create policy "companies_update" on companies for update
  using (is_super() or (is_admin() and slug = my_company()));

-- ════════ ПЕРСОНАЛЬНЫЙ МЕНЕДЖЕР ОБЪЕКТА (Окно 1, опционально) ════════
alter table objects add column if not exists manager_tg text;

-- ════════ RPC ПОРТАЛА: + контакт поддержки компании + manager_tg объекта ════════
-- Сохраняем фильтр v7 (клиент видит только client_state='approved').
create or replace function get_shared_object(token text) returns json
  language sql stable security definer set search_path = public as $$
  select case when coalesce(token,'')='' then null else (
    select json_build_object(
      'name', o.name, 'status', o.status, 'address', o.address, 'company', o.company,
      'cover_url', o.cover_url, 'updated_at', o.updated_at, 'lat', o.lat, 'lon', o.lon,
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

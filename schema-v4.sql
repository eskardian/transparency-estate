-- Kampika map — миграция v4: две компании (Kampika / Zelege), стена доступа между ними.
-- Запустить в Supabase → SQL Editor → Run (после schema-v3.sql). Идемпотентна.
--
-- Модель: у объекта есть company. У человека в profiles.company — его компания.
--   company = NULL + is_admin = true → СУПЕР-АДМИН (видит обе компании, это Иван).
--   company = 'kampika' + is_admin = true → админ Kampika (видит все объекты Kampika).
--   company = 'kampika' + is_admin = false → сотрудник Kampika (видит только выданные объекты).
-- Zelege — симметрично.

-- ── Колонка компании у объекта (существующие → kampika)
alter table objects add column if not exists company text not null default 'kampika';
update objects set company = 'kampika' where company is null;

-- ── Компания у человека (NULL = супер-админ, обе)
alter table profiles add column if not exists company text;
alter table allowed_emails add column if not exists company text;

-- Иван — супер-админ над обеими
update profiles      set company = null, is_admin = true where email = 'rysky2016@gmail.com';
update allowed_emails set company = null, is_admin = true where email = 'rysky2016@gmail.com';

-- ── Хелперы (security definer → без рекурсии политик)
create or replace function my_company() returns text
  language sql stable security definer set search_path = public as $$
  select company from profiles where id = auth.uid();
$$;

create or replace function is_super() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin and company is null from profiles where id = auth.uid()), false);
$$;

-- видит ли текущий юзер объект: супер | админ своей компании | выданный лично
create or replace function can_see_object(obj bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_super()
      or has_access(obj)
      or exists(select 1 from objects o where o.id = obj and o.company = my_company() and is_admin());
$$;

-- ── Профиль при регистрации: подтянуть роль И компанию из белого списка
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare adm boolean; comp text;
begin
  select coalesce(is_admin,false), company into adm, comp
    from allowed_emails where lower(email) = lower(new.email);
  insert into public.profiles (id, email, is_admin, company)
    values (new.id, new.email, coalesce(adm,false), comp)
    on conflict (id) do nothing;
  return new;
end; $$;

-- ── Политики objects (через can_see_object); создавать — только в своей компании
drop policy if exists "objects_select" on objects;
drop policy if exists "objects_insert" on objects;
drop policy if exists "objects_update" on objects;
drop policy if exists "objects_delete" on objects;
create policy "objects_select" on objects for select using (can_see_object(id));
create policy "objects_insert" on objects for insert with check (is_super() or company = my_company());
create policy "objects_update" on objects for update using (can_see_object(id));
create policy "objects_delete" on objects for delete using (can_see_object(id));

-- ── Политики feed (видит ленту — кто видит объект)
drop policy if exists "feed_select" on feed_entries;
drop policy if exists "feed_insert" on feed_entries;
drop policy if exists "feed_delete" on feed_entries;
create policy "feed_select" on feed_entries for select using (can_see_object(object_id));
create policy "feed_insert" on feed_entries for insert with check (can_see_object(object_id));
create policy "feed_delete" on feed_entries for delete using (can_see_object(object_id));

-- ── Как добавить человека в нужную компанию (пример):
-- insert into allowed_emails (email, is_admin, company, note)
--   values ('petr@kampika.ru', false, 'kampika', 'Пётр, прораб') on conflict (email) do nothing;
-- админ компании:  is_admin = true,  company = 'kampika'
-- сотрудник:       is_admin = false, company = 'kampika'  (+ выдать объекты через «Доступы»)

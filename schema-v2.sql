-- Kampika map — миграция v2. Запустить в Supabase → SQL Editor → Run (поверх schema.sql).
-- Добавляет: профили, роли, права на запись (RLS), авто-триггеры, политики хранилища фото.
-- Идемпотентна — можно прогнать повторно.

-- ── Профили (зеркало auth.users): нужны, чтобы выдавать доступ по почте и хранить роль
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- ── Хелперы (security definer → читают служебно, в обход RLS, без рекурсии политик)
create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function has_access(obj bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from object_access where object_id = obj and user_id = auth.uid());
$$;

-- ── Политики профилей
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin());

-- ── Авто-создание профиля при регистрации + бэкафилл существующих
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
insert into profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

-- ── Новые колонки объектов
alter table objects add column if not exists created_by uuid references auth.users(id);
alter table objects add column if not exists address text;
alter table objects add column if not exists manager text;     -- ответственный
alter table objects add column if not exists phone text;       -- телефон ответственного
alter table objects add column if not exists due_date date;    -- плановый срок

-- ── Политики objects: видит админ или у кого доступ; пишет — так же
drop policy if exists "see allowed objects" on objects;
drop policy if exists "objects_select" on objects;
drop policy if exists "objects_insert" on objects;
drop policy if exists "objects_update" on objects;
drop policy if exists "objects_delete" on objects;
create policy "objects_select" on objects for select using (is_admin() or has_access(id));
create policy "objects_insert" on objects for insert with check (auth.uid() is not null);
create policy "objects_update" on objects for update using (is_admin() or has_access(id));
create policy "objects_delete" on objects for delete using (is_admin() or has_access(id));

-- ── Политики feed
drop policy if exists "see allowed feed" on feed_entries;
drop policy if exists "feed_select" on feed_entries;
drop policy if exists "feed_insert" on feed_entries;
drop policy if exists "feed_delete" on feed_entries;
create policy "feed_select" on feed_entries for select using (is_admin() or has_access(object_id));
create policy "feed_insert" on feed_entries for insert with check (is_admin() or has_access(object_id));
create policy "feed_delete" on feed_entries for delete using (is_admin() or has_access(object_id));

-- ── Политики object_access: админ управляет, юзер видит свои
drop policy if exists "see own access" on object_access;
drop policy if exists "access_select" on object_access;
drop policy if exists "access_insert" on object_access;
drop policy if exists "access_delete" on object_access;
create policy "access_select" on object_access for select using (user_id = auth.uid() or is_admin());
create policy "access_insert" on object_access for insert with check (is_admin());
create policy "access_delete" on object_access for delete using (is_admin());

-- ── Создателю объекта — автодоступ owner
create or replace function grant_creator_access() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into object_access (object_id, user_id, role)
    values (new.id, new.created_by, 'owner') on conflict do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists on_object_created on objects;
create trigger on_object_created after insert on objects
  for each row execute function grant_creator_access();

-- ── Новая запись в ленте бампает updated_at объекта
create or replace function bump_object_updated() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update objects set updated_at = now() where id = new.object_id;
  return new;
end; $$;
drop trigger if exists on_feed_insert on feed_entries;
create trigger on_feed_insert after insert on feed_entries
  for each row execute function bump_object_updated();

-- ── Хранилище фото: вошедшие читают и загружают
insert into storage.buckets (id, name, public) values ('photos','photos',true) on conflict (id) do nothing;
drop policy if exists "photos_read" on storage.objects;
create policy "photos_read" on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "photos_write" on storage.objects;
create policy "photos_write" on storage.objects for insert
  with check (bucket_id = 'photos' and auth.uid() is not null);

-- ── ПОСЛЕДНИЙ ШАГ: сделать себя админом (видишь все объекты, управляешь доступами)
update profiles set is_admin = true where email = 'rysky2016@gmail.com';

-- Kampika map — миграция v3: белый список допущенных почт.
-- Запустить в Supabase → SQL Editor → Run (после schema-v2.sql). Идемпотентна.
--
-- Логика: почта в allowed_emails → при первом входе человек сразу получает профиль
-- и роль (админ/обычный) из списка. Кого нет в списке — может войти, но видит пустой
-- сайт (ни объектов, ни прав), пока админ не выдаст доступ вручную.

create table if not exists allowed_emails (
  email     text primary key,
  is_admin  boolean default false,
  note      text,
  added_at  timestamptz default now()
);

-- Иван — первый, сразу админ
insert into allowed_emails (email, is_admin, note) values
  ('rysky2016@gmail.com', true, 'Иван — владелец')
  on conflict (email) do update set is_admin = excluded.is_admin;

-- Триггер создания профиля: подтягивает роль из белого списка
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare adm boolean;
begin
  select coalesce(is_admin, false) into adm from allowed_emails where lower(email) = lower(new.email);
  insert into public.profiles (id, email, is_admin)
    values (new.id, new.email, coalesce(adm, false))
    on conflict (id) do nothing;
  return new;
end; $$;

-- Подтянуть роли для уже существующих профилей по списку (на случай, если кто-то вошёл раньше)
update profiles p set is_admin = true
  from allowed_emails a where lower(p.email) = lower(a.email) and a.is_admin = true;

-- ── Как добавить нового человека в список (пример):
-- insert into allowed_emails (email, is_admin, note) values ('petr@kampika.ru', false, 'Пётр, прораб')
--   on conflict (email) do nothing;

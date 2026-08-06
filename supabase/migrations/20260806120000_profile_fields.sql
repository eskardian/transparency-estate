-- Профиль пользователя (экран 7f в v2): телефон для клиентов + настройки уведомлений.
-- full_name уже есть. Идемпотентна.
alter table profiles add column if not exists client_phone text;
alter table profiles add column if not exists notif jsonb not null default '{}'::jsonb;

-- Безопасное обновление СВОЕГО профиля: только имя/телефон/уведомления.
-- Через RPC (не прямой update), чтобы пользователь не мог выставить себе is_admin/company.
create or replace function update_my_profile(p_name text, p_phone text, p_notif jsonb) returns void
  language sql volatile security definer set search_path = public as $$
  update profiles
     set full_name = p_name, client_phone = p_phone, notif = coalesce(p_notif, '{}'::jsonb)
   where id = auth.uid();
$$;
grant execute on function update_my_profile(text, text, jsonb) to authenticated;

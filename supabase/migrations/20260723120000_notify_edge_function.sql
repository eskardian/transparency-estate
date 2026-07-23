-- Уведомления менеджеру: переключение с Netlify-функции на Supabase Edge Function.
-- Функция notify-manager задеплоена с --no-verify-jwt → Authorization не нужен.
-- Триггер trg_notify_manager (из 20260711100000) не меняется, обновляем только тело функции. Идемпотентна.
create or replace function notify_manager_on_report() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.client_state is null or new.client_state = 'pending' then
    perform net.http_post(
      url := 'https://pqmjulphghojlaijffty.supabase.co/functions/v1/notify-manager',
      body := jsonb_build_object('record', to_jsonb(new)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end $$;

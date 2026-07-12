-- Уведомление менеджеру: на новый отчёт (client_state='pending') база дёргает Netlify-функцию,
-- та шлёт сообщение в Telegram. Через pg_net (net.http_post). Идемпотентна.

create extension if not exists pg_net;

create or replace function notify_manager_on_report() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.client_state is null or new.client_state = 'pending' then
    perform net.http_post(
      url := 'https://stellular-crostata-c4fb1c.netlify.app/.netlify/functions/notify-manager',
      body := jsonb_build_object('record', to_jsonb(new)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_manager on feed_entries;
create trigger trg_notify_manager after insert on feed_entries
  for each row execute function notify_manager_on_report();

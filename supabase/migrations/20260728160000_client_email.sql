-- Уведомления клиенту: email клиента у объекта + триггер при согласовании отчёта.
-- Когда запись становится approved (менеджер показал клиенту) → письмо клиенту. Идемпотентна.
alter table objects add column if not exists client_email text;

create extension if not exists pg_net;

create or replace function notify_client_on_approve() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- только когда запись стала видимой клиенту (approved), и раньше такой не была
  if new.client_state = 'approved' and (tg_op = 'INSERT' or old.client_state is distinct from 'approved') then
    perform net.http_post(
      url := 'https://pqmjulphghojlaijffty.supabase.co/functions/v1/notify-client',
      body := jsonb_build_object('record', to_jsonb(new)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_client on feed_entries;
create trigger trg_notify_client after insert or update on feed_entries
  for each row execute function notify_client_on_approve();

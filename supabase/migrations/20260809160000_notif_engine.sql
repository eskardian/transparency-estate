-- Движок доставки клиентских уведомлений по событиям (этап/срок/документ/эфир/уход).
-- Очередь + триггеры на события + диспетч в Edge Function notify-dispatch. Идемпотентна.

create table if not exists client_notifications (
  id         bigint generated always as identity primary key,
  object_id  bigint not null references objects(id) on delete cascade,
  event      text not null,                 -- stage | due | document | live | care
  title      text,
  body       text,
  state      text not null default 'approved', -- pending | approved | sent | skipped
  freq       text not null default 'instant',  -- instant | weekly
  created_at timestamptz default now(),
  sent_at    timestamptz
);
alter table client_notifications enable row level security;
drop policy if exists cn_sel on client_notifications;
create policy cn_sel on client_notifications for select using (can_manage_object(object_id));
drop policy if exists cn_upd on client_notifications;
create policy cn_upd on client_notifications for update using (can_manage_object(object_id)) with check (can_manage_object(object_id));
-- INSERT — только через security-definer enqueue (триггеры), обычным ролям запрещён.

-- Кладёт уведомление по настройкам события: off → ничего; confirm → pending, иначе approved.
create or replace function enqueue_client_notif(p_obj bigint, p_event text, p_title text, p_body text)
  returns void language plpgsql security definer set search_path = public as $$
declare s jsonb; freq text;
begin
  select notif_settings -> p_event into s from objects where id = p_obj;
  if s is null or not coalesce((s->>'on')::boolean, false) then return; end if;
  freq := coalesce(s->>'freq', 'instant');
  if freq = 'off' then return; end if;
  insert into client_notifications(object_id, event, title, body, state, freq)
  values (p_obj, p_event, p_title, p_body,
          case when coalesce((s->>'confirm')::boolean, false) then 'pending' else 'approved' end, freq);
end $$;

-- Диспетч: approved+instant → письмо клиенту; pending → запрос подтверждения менеджеру (Telegram).
create or replace function dispatch_client_notif() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (new.state = 'approved' and new.freq = 'instant' and new.sent_at is null)
     or (new.state = 'pending' and tg_op = 'INSERT') then
    perform net.http_post(
      url := 'https://pqmjulphghojlaijffty.supabase.co/functions/v1/notify-dispatch',
      body := jsonb_build_object('record', to_jsonb(new)),
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists trg_dispatch_notif on client_notifications;
create trigger trg_dispatch_notif after insert or update of state on client_notifications
  for each row execute function dispatch_client_notif();

-- События объекта: смена этапа / старт эфира / перевод на уход.
create or replace function on_object_notif() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status is not null then
    perform enqueue_client_notif(new.id, 'stage', 'Новый этап', 'Объект перешёл к этапу «' || new.status || '».');
  end if;
  if coalesce(old.live_url,'') = '' and coalesce(new.live_url,'') <> '' then
    perform enqueue_client_notif(new.id, 'live', 'Прямой эфир', 'На объекте начался прямой эфир — можно заглянуть.');
  end if;
  if coalesce(old.care,false) = false and coalesce(new.care,false) = true then
    perform enqueue_client_notif(new.id, 'care', 'Сезонный уход', 'Объект переведён на сезонное обслуживание.');
  end if;
  return new;
end $$;
drop trigger if exists trg_object_notif on objects;
create trigger trg_object_notif after update on objects
  for each row execute function on_object_notif();

-- Документ для клиента.
create or replace function on_document_notif() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.client_visible then
    perform enqueue_client_notif(new.object_id, 'document', 'Новый документ', 'Для вас загружен документ «' || coalesce(new.name,'') || '».');
  end if;
  return new;
end $$;
drop trigger if exists trg_document_notif on object_documents;
create trigger trg_document_notif after insert on object_documents
  for each row execute function on_document_notif();

-- Срок сдачи: ежедневный крон, за 0–3 дня до due_date, один раз в неделю на объект.
create or replace function enqueue_due_notifs() returns void
  language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select o.id, o.due_date from objects o
    where o.due_date is not null and o.status <> 'Завершён'
      and o.due_date between current_date and current_date + 3
      and not exists (select 1 from client_notifications c
        where c.object_id = o.id and c.event = 'due' and c.created_at > now() - interval '7 days')
  loop
    perform enqueue_client_notif(r.id, 'due', 'Скоро сдача',
      'Приближается плановый срок сдачи объекта (' || to_char(r.due_date, 'DD.MM.YYYY') || ').');
  end loop;
end $$;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'daily-due-notifs') then perform cron.unschedule('daily-due-notifs'); end if;
end $$;
select cron.schedule('daily-due-notifs', '0 8 * * *', $$ select enqueue_due_notifs(); $$);

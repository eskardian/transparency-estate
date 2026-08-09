-- Настройки авто-уведомлений клиента (per-object): что / как часто / нужно ли подтверждение.
-- Структура: { <event>: { on: bool, freq: 'instant'|'weekly'|'off', confirm: bool } }
-- События: report (новый отчёт), stage (смена этапа), due (срок сдачи),
--          document (документ клиенту), live (эфир), care (сезонный уход).
-- Дефолт сохраняет текущее поведение: отчёты требуют подтверждения и шлются сразу.
alter table objects add column if not exists notif_settings jsonb;

update objects set notif_settings = jsonb_build_object(
  'report',   jsonb_build_object('on', true,  'freq', 'instant', 'confirm', true),
  'stage',    jsonb_build_object('on', false, 'freq', 'instant', 'confirm', false),
  'due',      jsonb_build_object('on', false, 'freq', 'weekly',  'confirm', false),
  'document', jsonb_build_object('on', true,  'freq', 'instant', 'confirm', false),
  'live',     jsonb_build_object('on', false, 'freq', 'instant', 'confirm', false),
  'care',     jsonb_build_object('on', false, 'freq', 'weekly',  'confirm', false)
) where notif_settings is null;

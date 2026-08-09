-- Еженедельный дайджест клиенту: расписание pg_cron дёргает Edge Function weekly-digest.
-- Понедельник 09:00 UTC (12:00 МСК). Функция задеплоена с --no-verify-jwt → без Authorization.
-- Идемпотентна.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-client-digest') then
    perform cron.unschedule('weekly-client-digest');
  end if;
end $$;

select cron.schedule('weekly-client-digest', '0 9 * * 1', $$
  select net.http_post(
    url := 'https://pqmjulphghojlaijffty.supabase.co/functions/v1/weekly-digest',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
$$);

-- Kampika map — миграция v5: админ-панель (управление командой из приложения).
-- Запустить в Supabase → SQL Editor → Run (после schema-v4.sql). Идемпотентна.
--
-- Даёт супер-админу право управлять списком допущенных людей (allowed_emails)
-- и менять роль/компанию уже зарегистрированных (profiles) прямо из интерфейса.
-- Обычные сотрудники сюда не попадают — всё закрыто на is_super().

-- ── allowed_emails: полный доступ только супер-админу
drop policy if exists "allowed_select" on allowed_emails;
drop policy if exists "allowed_insert" on allowed_emails;
drop policy if exists "allowed_update" on allowed_emails;
drop policy if exists "allowed_delete" on allowed_emails;
create policy "allowed_select" on allowed_emails for select using (is_super());
create policy "allowed_insert" on allowed_emails for insert with check (is_super());
create policy "allowed_update" on allowed_emails for update using (is_super());
create policy "allowed_delete" on allowed_emails for delete using (is_super());

-- ── profiles: супер-админ может менять роль/компанию существующих
drop policy if exists "profiles_update_super" on profiles;
create policy "profiles_update_super" on profiles for update using (is_super()) with check (is_super());

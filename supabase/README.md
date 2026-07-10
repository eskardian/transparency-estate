# Миграции базы (Supabase)

Автонакат: push в `main` с новым файлом в `migrations/` → Supabase GitHub-интеграция применяет только новые миграции. Руками SQL Editor больше не трогаем.

## База (baseline)
Схемы v1–v6 (`../schema.sql`, `../schema-v2.sql` … `../schema-v6.sql`) уже применены в проекте вручную до перехода на CI. Они оставлены в корне как история и повторно не накатываются.

## Как добавить изменение БД
1. Новый файл `migrations/<YYYYMMDDHHMMSS>_краткое-имя.sql` (таймстамп определяет порядок).
2. SQL пишем **идемпотентно** (`create table if not exists`, `drop policy if exists` перед `create policy`) — чтобы повторный прогон не падал.
3. `git push` — интеграция накатит. Проверить статус: Supabase → Database → Migrations.

## Первая версионируемая миграция
`20260710120000_client_approval.sql` — согласование отчётов менеджером (`feed_entries.client_state`, политика update, фильтр в `get_shared_object`).

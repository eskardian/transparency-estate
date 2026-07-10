-- Kampika — схема базы. Вставить целиком в Supabase → SQL Editor → Run.

-- 1. Объекты
create table objects (
  id bigint generated always as identity primary key,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  cover_url text,
  status text,
  updated_at timestamptz default now()
);

-- 2. Лента работ внутри объекта
create table feed_entries (
  id bigint generated always as identity primary key,
  object_id bigint references objects(id) on delete cascade,
  body text,
  status text,
  photos text[] default '{}',
  created_at timestamptz default now()
);

-- 3. Доступ: кто какой объект видит
create table object_access (
  object_id bigint references objects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'viewer',
  primary key (object_id, user_id)
);

-- RLS: права описаны в базе, не в коде приложения
alter table objects enable row level security;
alter table feed_entries enable row level security;
alter table object_access enable row level security;

create policy "see allowed objects" on objects for select
  using (exists (select 1 from object_access a
                 where a.object_id = objects.id and a.user_id = auth.uid()));

create policy "see allowed feed" on feed_entries for select
  using (exists (select 1 from object_access a
                 where a.object_id = feed_entries.object_id and a.user_id = auth.uid()));

create policy "see own access" on object_access for select
  using (user_id = auth.uid());

-- Хранилище фото (публичное чтение)
-- ponytail: публичный бакет на старте; signed URLs когда утечка ссылок станет проблемой
insert into storage.buckets (id, name, public)
  values ('photos', 'photos', true) on conflict (id) do nothing;

-- Сидовые объекты, чтобы карта не была пустой
insert into objects (name, lat, lon, cover_url, status) values
  ('Участок на Рублёвке', 55.751, 37.401, 'https://picsum.photos/seed/k1/400/200', 'Идёт планировка'),
  ('Сад в Барвихе',       55.736, 37.298, 'https://picsum.photos/seed/k2/400/200', 'Посадка крупномеров'),
  ('Терраса в Жуковке',   55.762, 37.331, 'https://picsum.photos/seed/k3/400/200', 'Проектирование');

insert into feed_entries (object_id, body, status) values
  (1, 'Завезли грунт, выровняли северную часть.', 'Идёт планировка'),
  (2, 'Высадили 4 крупномера, полив настроен.',   'Посадка крупномеров'),
  (3, 'Готов первый эскиз мощения.',              'Проектирование');

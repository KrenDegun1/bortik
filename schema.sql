-- Бортик: хранилище состояния приложения.
-- Вставить целиком в Supabase → SQL Editor → Run.
-- Повторный запуск безопасен.

create table if not exists public.spaces (
  key        text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Прямой доступ к таблице закрыт наглухо: ни чтения, ни записи, ни списка ключей.
alter table public.spaces enable row level security;
revoke all on table public.spaces from anon, authenticated;

-- Работать можно только через эти две функции, и только зная секрет.

create or replace function public.load_space(k text)
returns table (data jsonb, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.data, s.updated_at
  from public.spaces s
  where s.key = k;
$$;

create or replace function public.save_space(k text, d jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
begin
  -- короткий ключ подбирается перебором, такие не принимаем
  if k is null or length(k) < 24 then
    raise exception 'key too short';
  end if;

  -- 4 МБ с запасом: у тренера столько данных не наберётся и за годы
  if pg_column_size(d) > 4194304 then
    raise exception 'payload too large';
  end if;

  insert into public.spaces (key, data, updated_at)
  values (k, d, now())
  on conflict (key) do update
    set data = excluded.data,
        updated_at = now()
  returning spaces.updated_at into ts;

  return ts;
end;
$$;

revoke all on function public.load_space(text) from public;
revoke all on function public.save_space(text, jsonb) from public;
grant execute on function public.load_space(text) to anon;
grant execute on function public.save_space(text, jsonb) to anon;

-- =====================================================
-- База данных для сайта записи.
-- Вставь весь этот файл в Supabase → SQL Editor → Run.
-- =====================================================


-- 1. Окошки, которые сестра открыла для записи.
--    Чего нет в этой таблице — того у учеников просто нет.
create table open_slots (
  slot_date date not null,   -- день, например 2026-11-07
  slot_time text not null,   -- время, например '15:00'
  primary key (slot_date, slot_time)
);

-- 2. Заявки учеников
create table requests (
  id         bigint generated always as identity primary key,
  created_at timestamptz default now(),          -- когда отправили
  slot_date  date not null,
  slot_time  text not null,
  name       text not null,                      -- фамилия и имя
  teacher    text not null,                      -- учитель
  comment    text default '',                    -- комментарий
  status     text not null default 'pending'     -- pending / approved / rejected
             check (status in ('pending', 'approved', 'rejected'))
);

-- 3. На одно окошко может быть только одна живая заявка
--    (отклонённые не считаются — их окошко снова свободно)
create unique index one_request_per_slot
  on requests (slot_date, slot_time)
  where status <> 'rejected';


-- =====================================================
-- Защита (RLS — Row Level Security).
-- Посетители не могут читать и менять таблицы напрямую.
-- Только вошедший админ (сестра) может.
-- =====================================================
alter table open_slots enable row level security;
alter table requests   enable row level security;

create policy "admin reads slots"      on open_slots for select to authenticated using (true);
create policy "admin opens slot"       on open_slots for insert to authenticated with check (true);
create policy "admin closes slot"      on open_slots for delete to authenticated using (true);
create policy "admin reads requests"   on requests   for select to authenticated using (true);
create policy "admin updates requests" on requests   for update to authenticated using (true);
create policy "admin deletes requests" on requests   for delete to authenticated using (true);


-- =====================================================
-- Функция 1: свободные окошки за период.
-- Берёт открытые окошки и убирает те, на которые уже есть заявка.
-- Имён не отдаёт — посетители видят только дату и время.
-- =====================================================
create function get_free_slots(from_date date, to_date date)
returns table (slot_date date, slot_time text)
language sql
security definer
set search_path = public
as $$
  select o.slot_date, o.slot_time
  from open_slots o
  where o.slot_date between from_date and to_date
    and not exists (
      select 1 from requests r
      where r.slot_date = o.slot_date
        and r.slot_time = o.slot_time
        and r.status <> 'rejected'
    )
  order by o.slot_date, o.slot_time;
$$;


-- =====================================================
-- Функция 2: отправить заявку.
-- Сама всё проверяет и отвечает одним словом:
--   'ok'       — заявка сохранена
--   'already'  — этот человек уже записан на этот день
--   'busy'     — окошко уже заняли или оно закрыто
--   'empty'    — не заполнены имя или учитель
--   'bad'      — дата в прошлом или слишком длинный текст
-- =====================================================
create function send_request(p_date date, p_time text, p_name text, p_teacher text, p_comment text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- имя без лишних пробелов и маленькими буквами, чтобы «Иванова  Мария» = «иванова мария»
  clean_name text := lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
begin
  if clean_name = '' or trim(p_teacher) = '' then
    return 'empty';
  end if;

  if length(p_name) > 100 or length(p_teacher) > 100 or length(coalesce(p_comment, '')) > 200 then
    return 'bad';
  end if;

  if p_date < current_date then
    return 'bad';
  end if;

  -- уже есть заявка с таким именем на этот день?
  if exists (
    select 1 from requests
    where slot_date = p_date
      and status <> 'rejected'
      and lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = clean_name
  ) then
    return 'already';
  end if;

  -- окошко вообще открыто сестрой?
  if not exists (select 1 from open_slots where slot_date = p_date and slot_time = p_time) then
    return 'busy';
  end if;

  insert into requests (slot_date, slot_time, name, teacher, comment)
  values (p_date, p_time, trim(p_name), trim(p_teacher), coalesce(p_comment, ''));

  return 'ok';

exception
  -- кто-то успел занять это окошко на секунду раньше
  when unique_violation then
    return 'busy';
end;
$$;

-- Разрешаем посетителям вызывать эти две функции
grant execute on function get_free_slots(date, date) to anon, authenticated;
grant execute on function send_request(date, text, text, text, text) to anon, authenticated;

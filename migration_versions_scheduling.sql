-- ОНОВЛЕННЯ для вже створеної бази: історія змін + відкладена публікація.
-- Виконати ОДИН РАЗ у Supabase → SQL Editor → Run. (Спершу має бути виконано migration_amendments.sql.)

alter table public.acts add column if not exists publish_at timestamptz not null default now();
alter table public.acts add column if not exists version int not null default 1;
alter table public.acts add column if not exists updated_by uuid;
alter table public.acts add column if not exists updated_by_name text;

-- старий тригер оновлення дати прибираємо до заповнення нових колонок
drop trigger if exists acts_touch on public.acts;
drop trigger if exists acts_before_write on public.acts;

-- наявні акти вважаються опублікованими в момент створення; автор поточної версії = той, хто створив
update public.acts a set
  publish_at = a.created_at,
  updated_by = a.created_by,
  updated_by_name = (select p.full_name from public.profiles p where p.id = a.created_by);

create table if not exists public.act_versions (
  id bigint generated always as identity primary key,
  act_id bigint not null references public.acts(id) on delete cascade,
  version_no int not null,
  act_type text, number text, act_date date, status text, title text, body text, signer text,
  publish_at timestamptz,
  saved_by uuid, saved_by_name text, saved_at timestamptz,
  unique (act_id, version_no)
);

-- ---------- перевірка ролі ----------
create or replace function public.has_role(r text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = any(r));
$$;

-- ---------- версіонування: перед кожною зміною старий стан зберігається ----------
create or replace function public.acts_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  select full_name into uname from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    new.version := 1;
    new.updated_by := auth.uid();
    new.updated_by_name := uname;
    new.updated_at := now();
    return new;
  end if;
  if (old.act_type, old.number, old.act_date, old.status, old.title, old.body, old.signer, old.publish_at)
     is distinct from
     (new.act_type, new.number, new.act_date, new.status, new.title, new.body, new.signer, new.publish_at) then
    insert into public.act_versions
      (act_id, version_no, act_type, number, act_date, status, title, body, signer, publish_at, saved_by, saved_by_name, saved_at)
    values
      (old.id, old.version, old.act_type, old.number, old.act_date, old.status, old.title, old.body, old.signer, old.publish_at,
       old.updated_by, old.updated_by_name, old.updated_at);
    new.version := old.version + 1;
    new.updated_by := auth.uid();
    new.updated_by_name := uname;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_by := old.updated_by;
    new.updated_by_name := old.updated_by_name;
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists acts_touch on public.acts;
drop trigger if exists acts_before_write on public.acts;
create trigger acts_before_write before insert or update on public.acts
  for each row execute function public.acts_before_write();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.acts enable row level security;
alter table public.act_versions enable row level security;

drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles for select to authenticated using (id = auth.uid());

-- Відкладена публікація: звичайні користувачі бачать акт лише після publish_at, редактори й адміни — завжди
drop policy if exists "acts_read" on public.acts;
create policy "acts_read" on public.acts for select to authenticated
  using (publish_at <= now() or public.has_role(array['editor','admin']));
drop policy if exists "acts_insert" on public.acts;
create policy "acts_insert" on public.acts for insert to authenticated with check (public.has_role(array['editor','admin']));
drop policy if exists "acts_update" on public.acts;
create policy "acts_update" on public.acts for update to authenticated using (public.has_role(array['editor','admin'])) with check (public.has_role(array['editor','admin']));
drop policy if exists "acts_delete" on public.acts;
create policy "acts_delete" on public.acts for delete to authenticated using (public.has_role(array['admin']));

-- Історію змін бачать лише редактори й адміни; записує її тільки тригер
drop policy if exists "versions_read" on public.act_versions;
create policy "versions_read" on public.act_versions for select to authenticated using (public.has_role(array['editor','admin']));

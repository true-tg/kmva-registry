-- ПОВНА установка з нуля. Виконати в Supabase → SQL Editor → New query → Run

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'reader' check (role in ('reader','editor','admin'))
);

create table if not exists public.acts (
  id bigint generated always as identity primary key,
  act_type text not null check (act_type in ('order','ksoy')),
  number text not null,
  act_date date not null,
  topic text,
  status text not null default 'active' check (status in ('active','expired')),
  amends_id bigint references public.acts(id) on delete set null,
  title text not null,
  body text not null,
  signer text,
  publish_at timestamptz not null default now(),
  version int not null default 1,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  updated_at timestamptz not null default now()
);
create index if not exists acts_date_idx on public.acts (act_date desc, id desc);
create index if not exists acts_amends_idx on public.acts (amends_id);

create table if not exists public.act_versions (
  id bigint generated always as identity primary key,
  act_id bigint not null references public.acts(id) on delete cascade,
  version_no int not null,
  act_type text, number text, act_date date, status text, title text, body text, signer text,
  publish_at timestamptz,
  saved_by uuid, saved_by_name text, saved_at timestamptz,
  unique (act_id, version_no)
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

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

-- Призначення ролей (після створення користувачів у Authentication → Users):
-- update public.profiles set role = 'admin'  where full_name = 'admin@example.com';
-- update public.profiles set role = 'editor' where full_name = 'kancelariya@example.com';

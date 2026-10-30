-- Виконати в Supabase → SQL Editor → New query → Run

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
  title text not null,
  body text not null,
  signer text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists acts_date_idx on public.acts (act_date desc, id desc);

-- автостворення профілю при реєстрації користувача
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- перевірка ролі
create or replace function public.has_role(r text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = any(r));
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists acts_touch on public.acts;
create trigger acts_touch before update on public.acts
  for each row execute function public.touch_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.acts enable row level security;

drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists "acts_read" on public.acts;
create policy "acts_read"   on public.acts for select to authenticated using (true);
drop policy if exists "acts_insert" on public.acts;
create policy "acts_insert" on public.acts for insert to authenticated with check (public.has_role(array['editor','admin']));
drop policy if exists "acts_update" on public.acts;
create policy "acts_update" on public.acts for update to authenticated using (public.has_role(array['editor','admin'])) with check (public.has_role(array['editor','admin']));
drop policy if exists "acts_delete" on public.acts;
create policy "acts_delete" on public.acts for delete to authenticated using (public.has_role(array['admin']));

-- Призначення ролей (після створення користувачів у Authentication → Users):
-- update public.profiles set role = 'admin'  where full_name = 'admin@example.com';
-- update public.profiles set role = 'editor' where full_name = 'kancelariya@example.com';

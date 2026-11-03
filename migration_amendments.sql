-- Виконати ОДИН РАЗ у Supabase → SQL Editor, якщо базу вже створено раніше.
-- Додає зв'язок «акт про внесення змін → початковий акт».
alter table public.acts
  add column if not exists amends_id bigint references public.acts(id) on delete set null;
create index if not exists acts_amends_idx on public.acts (amends_id);

-- Execute uma vez no SQL Editor do seu projeto Supabase.
-- Esta migração pode ser executada novamente sem apagar cadernos existentes.
begin;

create or replace function public.valid_notebook_document(p_document jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
 p jsonb; b jsonb; note jsonb; page_number text;
 project_ids text[] := '{}'; book_ids text[] := '{}';
 capacity integer; total_pages integer := 0;
 colors text[] := array['forest','denim','terracotta','plum','charcoal','mustard'];
begin
 if p_document is null or jsonb_typeof(p_document) is distinct from 'object'
  or p_document->>'version' is distinct from '2'
  or jsonb_typeof(p_document->'projects') is distinct from 'array'
  or jsonb_typeof(p_document->'notebooks') is distinct from 'array'
  or octet_length(p_document::text) > 8388608 then return false; end if;
 if jsonb_array_length(p_document->'notebooks') > 3 then return false; end if;
 for p in select value from jsonb_array_elements(p_document->'projects') loop
  if jsonb_typeof(p) is distinct from 'object'
   or jsonb_typeof(p->'id') is distinct from 'string' or not (p->>'id' ~ '^[A-Za-z0-9_-]{1,90}$')
   or (p->>'id') = any(project_ids)
   or jsonb_typeof(p->'title') is distinct from 'string' or length(trim(p->>'title')) = 0 or length(p->>'title') > 60
   or jsonb_typeof(p->'subtitle') is distinct from 'string' or length(p->>'subtitle') > 100
   or not coalesce((p->>'color') = any(colors), false) then return false; end if;
  project_ids := array_append(project_ids, p->>'id');
 end loop;
 for b in select value from jsonb_array_elements(p_document->'notebooks') loop
  if jsonb_typeof(b) is distinct from 'object'
   or jsonb_typeof(b->'id') is distinct from 'string' or not (b->>'id' ~ '^[A-Za-z0-9_-]{1,90}$')
   or (b->>'id') = any(book_ids) or not coalesce((b->>'projectId') = any(project_ids), false)
   or jsonb_typeof(b->'title') is distinct from 'string' or length(trim(b->>'title')) = 0 or length(b->>'title') > 60
   or jsonb_typeof(b->'subtitle') is distinct from 'string' or length(b->>'subtitle') > 100
   or not coalesce((b->>'color') = any(colors), false)
   or not coalesce((b->>'paper') = any(array['lined','dotted','blank']), false)
   or jsonb_typeof(b->'capacity') is distinct from 'number' or not (b->>'capacity' ~ '^[1-3][0-9]{2}$')
   or jsonb_typeof(b->'pages') is distinct from 'object' then return false; end if;
  book_ids := array_append(book_ids, b->>'id');
  capacity := (b->>'capacity')::integer;
  if capacity < 100 or capacity > 300 then return false; end if;
  total_pages := total_pages + capacity;
  if total_pages > 300 then return false; end if;
  for page_number, note in select key, value from jsonb_each(b->'pages') loop
   if page_number !~ '^[1-9][0-9]{0,2}$' then return false; end if;
   if page_number::integer > capacity
    or jsonb_typeof(note) is distinct from 'object'
    or jsonb_typeof(note->'title') is distinct from 'string' or length(note->>'title') > 150
    or jsonb_typeof(note->'html') is distinct from 'string' or length(note->>'html') > 250000
    or jsonb_typeof(note->'updatedAt') is distinct from 'string' then return false; end if;
   perform (note->>'updatedAt')::timestamptz;
  end loop;
 end loop;
 return true;
exception when others then return false;
end;
$$;

create table if not exists public.notebook_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 document jsonb not null check (public.valid_notebook_document(document)),
 revision bigint not null default 1 check (revision >= 1),
 updated_at timestamptz not null default now()
);

alter table public.notebook_workspaces enable row level security;
revoke all on public.notebook_workspaces from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.notebook_workspaces to authenticated;

drop policy if exists notebook_workspace_select_own on public.notebook_workspaces;
create policy notebook_workspace_select_own on public.notebook_workspaces for select to authenticated
 using ((select auth.uid()) = user_id);
drop policy if exists notebook_workspace_insert_own on public.notebook_workspaces;
create policy notebook_workspace_insert_own on public.notebook_workspaces for insert to authenticated
 with check ((select auth.uid()) = user_id);
drop policy if exists notebook_workspace_update_own on public.notebook_workspaces;
create policy notebook_workspace_update_own on public.notebook_workspaces for update to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.stamp_notebook_workspace()
returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_op = 'UPDATE' then
  if new.user_id <> old.user_id then raise exception 'WORKSPACE_OWNER_IMMUTABLE'; end if;
  new.revision := old.revision + 1;
 else new.revision := 1;
 end if;
 new.updated_at := clock_timestamp();
 return new;
end;
$$;
drop trigger if exists notebook_workspace_stamp on public.notebook_workspaces;
create trigger notebook_workspace_stamp before insert or update on public.notebook_workspaces
 for each row execute function public.stamp_notebook_workspace();

create or replace function public.save_notebook_workspace(p_user_id uuid, p_document jsonb, p_expected_revision bigint)
returns table(revision bigint, updated_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then
  raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
 end if;
 if p_expected_revision is null or p_expected_revision < 0 then raise exception 'WORKSPACE_INVALID_REVISION'; end if;
 if p_expected_revision = 0 then
  insert into public.notebook_workspaces(user_id, document) values(p_user_id, p_document)
   on conflict (user_id) do nothing;
 else
  update public.notebook_workspaces as w set document = p_document
   where w.user_id = p_user_id and w.revision = p_expected_revision;
 end if;
 if not found then raise exception 'WORKSPACE_CONFLICT' using errcode = '40001'; end if;
 return query select w.revision, w.updated_at from public.notebook_workspaces as w where w.user_id = p_user_id;
end;
$$;
revoke all on function public.save_notebook_workspace(uuid,jsonb,bigint) from public, anon;
grant execute on function public.save_notebook_workspace(uuid,jsonb,bigint) to authenticated;
revoke all on function public.stamp_notebook_workspace() from public, anon, authenticated;
commit;

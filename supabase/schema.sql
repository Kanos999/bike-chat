-- Bike Chat — groups, blocks & profiles schema.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- It is idempotent: safe to re-run after edits.
--
-- The app talks to these tables through PostgREST (the same REST surface the auth
-- module already uses), authenticated with each rider's Supabase access token, so
-- Row Level Security below is what actually enforces access — not the client.
--
-- Identity note: the matcher keys riders by their *username* (riderId == username
-- in the app today), so group membership and blocks store the username string in
-- addition to the auth uid.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username    text unique,
  phone       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text unique not null,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id    uuid not null references public.groups (id) on delete cascade,
  member_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  username    text not null default '',
  joined_at   timestamptz not null default now(),
  primary key (group_id, member_id)
);

create table if not exists public.blocks (
  blocker_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_username text not null,
  created_at       timestamptz not null default now(),
  primary key (blocker_id, blocked_username)
);

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of a group?
-- SECURITY DEFINER so it can read group_members without tripping the table's own
-- RLS (which would otherwise recurse when used inside group_members policies).
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and member_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC: create a group (mints a unique join code, adds the owner as a member)
-- ---------------------------------------------------------------------------

create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
  code text;
  uname text;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Group name is required';
  end if;

  select username into uname from public.profiles where id = auth.uid();

  loop
    code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.groups where join_code = code);
  end loop;

  insert into public.groups (name, join_code, owner_id)
  values (trim(p_name), code, auth.uid())
  returning * into g;

  insert into public.group_members (group_id, member_id, username)
  values (g.id, auth.uid(), coalesce(uname, ''));

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: join a group by its share code
-- ---------------------------------------------------------------------------

create or replace function public.join_group_by_code(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
  uname text;
begin
  select * into g from public.groups where join_code = upper(trim(p_code));
  if g.id is null then
    raise exception 'No crew found for that code';
  end if;

  select username into uname from public.profiles where id = auth.uid();

  insert into public.group_members (group_id, member_id, username)
  values (g.id, auth.uid(), coalesce(uname, ''))
  on conflict (group_id, member_id) do update set username = excluded.username;

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.blocks        enable row level security;

-- profiles: a rider manages only their own row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
drop policy if exists profiles_upsert_own on public.profiles;
create policy profiles_upsert_own on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- groups: members can read; only the owner can rename/delete. Inserts happen via
-- create_group (SECURITY DEFINER), so no direct insert policy is granted.
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select using (public.is_group_member(id));
drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete using (owner_id = auth.uid());

-- group_members: a member can see the roster of any crew they belong to, and can
-- remove only themselves (leave). Joining happens via join_group_by_code.
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select using (public.is_group_member(group_id));
drop policy if exists group_members_leave on public.group_members;
create policy group_members_leave on public.group_members
  for delete using (member_id = auth.uid());

-- blocks: fully private to the blocker.
drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select using (blocker_id = auth.uid());
drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert with check (blocker_id = auth.uid());
drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete using (blocker_id = auth.uid());

-- Let authenticated riders call the RPCs.
grant execute on function public.create_group(text)        to authenticated;
grant execute on function public.join_group_by_code(text)  to authenticated;
grant execute on function public.is_group_member(uuid)     to authenticated;

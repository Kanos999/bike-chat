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

-- ===========================================================================
-- Friends, friend-built crews & ride history
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A friendship is a single directed row from requester -> addressee. It starts
-- 'pending' and flips to 'accepted' on acceptance; declines delete the row.
-- Friendship is logically symmetric, so reads/queries consider both directions.
create table if not exists public.friendships (
  requester_id  uuid not null references auth.users (id) on delete cascade,
  addressee_id  uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (requester_id, addressee_id)
);

-- One persisted ride per finished session, private to its owner. Scalar stat
-- columns let the history list render cheaply; `summary` holds the full
-- RideSummary blob (velocity/lean profiles) for the detail charts.
create table if not exists public.rides (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at          timestamptz not null,
  ended_at            timestamptz not null,
  ride_mode           text not null,
  group_id            uuid,
  distance_km         numeric not null default 0,
  max_speed_kph       numeric not null default 0,
  avg_speed_kph       numeric not null default 0,
  max_lean_left_deg   numeric not null default 0,
  max_lean_right_deg  numeric not null default 0,
  time_moving_sec     numeric not null default 0,
  time_stopped_sec    numeric not null default 0,
  summary             jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists rides_user_started_idx
  on public.rides (user_id, started_at desc);

-- The riders who shared a channel with the owner during a given ride. Keyed by
-- username (matcher identity), so they can be looked up / friend-requested later.
create table if not exists public.ride_matches (
  ride_id          uuid not null references public.rides (id) on delete cascade,
  matched_username text not null,
  primary key (ride_id, matched_username)
);

-- ---------------------------------------------------------------------------
-- Friend helpers + RPCs
-- ---------------------------------------------------------------------------

-- Are the current user and p_other accepted friends? SECURITY DEFINER so it can
-- be reused inside other policies/RPCs without tripping friendships' own RLS.
create or replace function public.are_friends(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = p_other)
        or (requester_id = p_other and addressee_id = auth.uid()))
  );
$$;

-- Username prefix search over profiles, excluding self. Needed because the
-- profiles table is otherwise self-read-only under RLS.
create or replace function public.search_users(p_query text)
returns table (id uuid, username text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username
  from public.profiles p
  where p.id <> auth.uid()
    and p.username is not null
    and p.username ilike trim(p_query) || '%'
  order by p.username
  limit 20;
$$;

create or replace function public.send_friend_request(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select id into target from public.profiles where username = trim(p_username);
  if target is null then
    raise exception 'No rider found with that callsign';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot add yourself';
  end if;
  -- Already linked (either direction, any status)? Then no-op.
  if exists (
    select 1 from public.friendships
    where (requester_id = auth.uid() and addressee_id = target)
       or (requester_id = target and addressee_id = auth.uid())
  ) then
    return;
  end if;
  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), target, 'pending');
end;
$$;

create or replace function public.respond_friend_request(p_requester uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_accept then
    update public.friendships
      set status = 'accepted', responded_at = now()
      where requester_id = p_requester and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
      where requester_id = p_requester and addressee_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

create or replace function public.remove_friend(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
    where (requester_id = auth.uid() and addressee_id = p_other)
       or (requester_id = p_other and addressee_id = auth.uid());
end;
$$;

-- Accepted friends, returning the *other* party's id + username.
create or replace function public.list_friends()
returns table (id uuid, username text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by p.username;
$$;

-- Pending requests involving me; direction tells the UI whether to show
-- Accept/Decline (incoming) or a muted "pending" (outgoing).
create or replace function public.list_friend_requests()
returns table (id uuid, username text, direction text)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.username,
    case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end as direction
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'pending'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by p.username;
$$;

-- ---------------------------------------------------------------------------
-- Crew membership by friend selection (owner adds directly)
-- ---------------------------------------------------------------------------

create or replace function public.add_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  if not exists (select 1 from public.groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'Only the crew owner can add members';
  end if;
  if not public.are_friends(p_member_id) then
    raise exception 'You can only add friends to a crew';
  end if;
  select username into uname from public.profiles where id = p_member_id;
  insert into public.group_members (group_id, member_id, username)
  values (p_group_id, p_member_id, coalesce(uname, ''))
  on conflict (group_id, member_id) do nothing;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The owner can remove anyone; a member can remove themselves (leave).
  if not exists (select 1 from public.groups where id = p_group_id and owner_id = auth.uid())
     and p_member_id <> auth.uid() then
    raise exception 'Only the crew owner can remove other members';
  end if;
  delete from public.group_members
    where group_id = p_group_id and member_id = p_member_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.friendships  enable row level security;
alter table public.rides        enable row level security;
alter table public.ride_matches enable row level security;

-- friendships: visible to either party; all writes go through the RPCs above.
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

-- rides: fully private to the owner (direct insert/select from the client).
drop policy if exists rides_select_own on public.rides;
create policy rides_select_own on public.rides
  for select using (user_id = auth.uid());
drop policy if exists rides_insert_own on public.rides;
create policy rides_insert_own on public.rides
  for insert with check (user_id = auth.uid());
drop policy if exists rides_delete_own on public.rides;
create policy rides_delete_own on public.rides
  for delete using (user_id = auth.uid());

-- ride_matches: gated by ownership of the parent ride.
drop policy if exists ride_matches_select on public.ride_matches;
create policy ride_matches_select on public.ride_matches
  for select using (
    exists (select 1 from public.rides r where r.id = ride_id and r.user_id = auth.uid())
  );
drop policy if exists ride_matches_insert on public.ride_matches;
create policy ride_matches_insert on public.ride_matches
  for insert with check (
    exists (select 1 from public.rides r where r.id = ride_id and r.user_id = auth.uid())
  );

-- Grants for the new RPCs.
grant execute on function public.are_friends(uuid)                     to authenticated;
grant execute on function public.search_users(text)                    to authenticated;
grant execute on function public.send_friend_request(text)             to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid)                   to authenticated;
grant execute on function public.list_friends()                        to authenticated;
grant execute on function public.list_friend_requests()                to authenticated;
grant execute on function public.add_group_member(uuid, uuid)          to authenticated;
grant execute on function public.remove_group_member(uuid, uuid)       to authenticated;

-- ============================================================
-- Plate Pass — Friends & Leaderboard Schema
-- Run this AFTER schema.sql and orders_migration.sql.
-- Supabase Dashboard → SQL Editor → New Query
-- ============================================================


-- --------------------------------------------------------
-- 1. FRIENDSHIPS TABLE
-- --------------------------------------------------------

create table if not exists public.friendships (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  friend_id  uuid references auth.users on delete cascade not null,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  unique (user_id, friend_id)
);

alter table public.friendships enable row level security;


-- --------------------------------------------------------
-- 2. RLS POLICIES
-- --------------------------------------------------------

drop policy if exists "Users can read own friendships" on public.friendships;
drop policy if exists "Users can insert own friendships" on public.friendships;
drop policy if exists "Users can delete own friendships" on public.friendships;
drop policy if exists "Users can update received friendships" on public.friendships;

create policy "Users can read own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can insert own friendships"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own friendships"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can update received friendships"
  on public.friendships for update
  to authenticated
  using (auth.uid() = friend_id);


-- --------------------------------------------------------
-- 3. SEND FRIEND REQUEST — RPC
--    Looks up a user by email, verifies they are a Passer
--    (volunteer role), then inserts a pending friendship.
-- --------------------------------------------------------

create or replace function public.send_friend_request(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_friend_id  uuid;
  v_friend_role text;
  v_friendship uuid;
  v_existing_status text;
begin
  select id into v_friend_id
    from auth.users
   where email = lower(trim(p_email));

  if not found then
    raise exception 'No user found with email: %', p_email;
  end if;

  if v_friend_id = auth.uid() then
    raise exception 'You cannot add yourself as a friend';
  end if;

  select raw_user_meta_data->>'role' into v_friend_role
    from auth.users
   where id = v_friend_id;

  if v_friend_role is null or v_friend_role != 'volunteer' then
    raise exception 'You can only add other Passers as friends.';
  end if;

  -- Check for existing friendship in either direction
  select status into v_existing_status
    from friendships
   where (user_id = auth.uid() and friend_id = v_friend_id)
      or (user_id = v_friend_id and friend_id = auth.uid())
   limit 1;

  if v_existing_status = 'accepted' then
    raise exception 'You are already friends with this user';
  end if;

  if v_existing_status = 'pending' then
    raise exception 'A friend request already exists between you and this user';
  end if;

  insert into friendships (user_id, friend_id, status)
  values (auth.uid(), v_friend_id, 'pending')
  returning id into v_friendship;

  return v_friendship;
end;
$$;


-- --------------------------------------------------------
-- 4. ACCEPT FRIEND REQUEST — RPC
--    The recipient (friend_id) accepts a pending request.
-- --------------------------------------------------------

create or replace function public.accept_friend_request(p_requester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update friendships
     set status = 'accepted'
   where user_id = p_requester_id
     and friend_id = auth.uid()
     and status = 'pending';

  if not found then
    raise exception 'No pending request found from this user';
  end if;
end;
$$;


-- --------------------------------------------------------
-- 5. DECLINE FRIEND REQUEST — RPC
--    The recipient (friend_id) declines / deletes a request.
-- --------------------------------------------------------

create or replace function public.decline_friend_request(p_requester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from friendships
   where user_id = p_requester_id
     and friend_id = auth.uid()
     and status = 'pending';

  if not found then
    raise exception 'No pending request found from this user';
  end if;
end;
$$;


-- --------------------------------------------------------
-- 6. GET INCOMING FRIEND REQUESTS — RPC
--    Returns pending requests sent TO the current user.
-- --------------------------------------------------------

create or replace function public.get_incoming_requests()
returns table (
  requester_id uuid,
  email        text,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    f.user_id          as requester_id,
    u.email::text      as email,
    f.created_at
  from friendships f
  join auth.users u on u.id = f.user_id
  where f.friend_id = auth.uid()
    and f.status = 'pending'
  order by f.created_at desc;
end;
$$;


-- --------------------------------------------------------
-- 7. GET LEADERBOARD — RPC
--    Returns the logged-in user + all their ACCEPTED friends,
--    each with their completed delivery count, sorted
--    descending.
-- --------------------------------------------------------

create or replace function public.get_friends_leaderboard()
returns table (
  user_id    uuid,
  email      text,
  deliveries bigint,
  is_self    boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with friend_ids as (
    select f.friend_id as uid from friendships f where f.user_id = auth.uid() and f.status = 'accepted'
    union
    select f.user_id as uid from friendships f where f.friend_id = auth.uid() and f.status = 'accepted'
    union
    select auth.uid() as uid
  )
  select
    fi.uid                                          as user_id,
    u.email::text                                   as email,
    coalesce(count(o.id), 0)                        as deliveries,
    (fi.uid = auth.uid())                           as is_self
  from friend_ids fi
  join auth.users u on u.id = fi.uid and u.raw_user_meta_data->>'role' = 'volunteer'
  left join orders o
    on o.volunteer_id = fi.uid
   and o.status = 'completed'
  group by fi.uid, u.email
  order by deliveries desc, u.email asc;
end;
$$;


-- --------------------------------------------------------
-- MIGRATION HELPER: Add status column to existing table
-- Run this if the friendships table already exists without
-- the status column.
-- --------------------------------------------------------
-- alter table public.friendships
--   add column if not exists status text not null default 'pending'
--   check (status in ('pending', 'accepted'));

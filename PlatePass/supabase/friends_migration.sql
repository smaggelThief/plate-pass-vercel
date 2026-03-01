-- ============================================================
-- Plate Pass — Friends Request & Accept Migration
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Upgrades the instant-add friend system to request/accept flow.
-- ============================================================

-- 1. Add status column to existing friendships table
alter table public.friendships
  add column if not exists status text not null default 'pending';

-- Set all existing friendships to 'accepted' (they were instant-adds)
update public.friendships set status = 'accepted' where status = 'pending';

-- 2. Add update RLS policy
drop policy if exists "Users can update received friendships" on public.friendships;
create policy "Users can update received friendships"
  on public.friendships for update
  to authenticated
  using (auth.uid() = friend_id);

-- Also update delete policy to allow either party to remove
drop policy if exists "Users can delete own friendships" on public.friendships;
create policy "Users can delete own friendships"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- 3. Replace add_friend_by_email with send_friend_request
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

-- 4. Create accept_friend_request
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

-- 5. Create decline_friend_request
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

-- 6. Create get_incoming_requests
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

-- 7. Update leaderboard to only count accepted friendships
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

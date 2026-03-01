-- ============================================================
-- Plate Pass — Orders Migration
-- Run this AFTER schema.sql has been applied.
-- Supabase Dashboard → SQL Editor → New Query
-- ============================================================


-- --------------------------------------------------------
-- 1. ORDERS TABLE
-- --------------------------------------------------------
create table if not exists public.orders (
  id               uuid default gen_random_uuid() primary key,
  donation_id      uuid references public.donations(id) on delete cascade not null,
  user_id          uuid references auth.users on delete cascade not null,
  volunteer_id     uuid references auth.users on delete set null,
  servings         int  not null check (servings > 0),
  delivery_method  text not null check (delivery_method in ('pickup', 'delivery')),
  delivery_address text,
  status           text not null default 'pending'
                     check (status in (
                       'pending',
                       'volunteer_accepted',
                       'picked_up',
                       'completed',
                       'cancelled'
                     )),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.orders enable row level security;


-- --------------------------------------------------------
-- 2. RLS POLICIES — SELECT
-- --------------------------------------------------------

-- Users see their own orders
create policy "Users can read own orders"
  on public.orders for select
  to authenticated
  using (auth.uid() = user_id);

-- Volunteers see unassigned delivery orders (the available feed)
create policy "Volunteers can read pending delivery orders"
  on public.orders for select
  to authenticated
  using (
    delivery_method = 'delivery'
    and volunteer_id is null
    and status = 'pending'
  );

-- Volunteers see orders they have accepted
create policy "Volunteers can read their accepted orders"
  on public.orders for select
  to authenticated
  using (auth.uid() = volunteer_id);

-- Restaurants see orders placed against their donations
create policy "Restaurants can read orders on own donations"
  on public.orders for select
  to authenticated
  using (
    exists (
      select 1 from public.donations
      where donations.id = orders.donation_id
        and donations.restaurant_id = auth.uid()
    )
  );


-- --------------------------------------------------------
-- 3. RLS POLICIES — INSERT
-- --------------------------------------------------------

create policy "Users can insert own orders"
  on public.orders for insert
  to authenticated
  with check (auth.uid() = user_id);


-- --------------------------------------------------------
-- 4. RLS POLICIES — UPDATE
-- --------------------------------------------------------

-- Volunteers can accept an unassigned delivery order
create policy "Volunteers can accept delivery orders"
  on public.orders for update
  to authenticated
  using (
    delivery_method = 'delivery'
    and volunteer_id is null
    and status = 'pending'
  )
  with check (
    auth.uid() = volunteer_id
    and status = 'volunteer_accepted'
  );

-- Volunteers can progress status on orders they own
create policy "Volunteers can update accepted orders"
  on public.orders for update
  to authenticated
  using  (auth.uid() = volunteer_id)
  with check (auth.uid() = volunteer_id);

-- Users can update their own orders (cancel, mark pickup complete)
create policy "Users can update own orders"
  on public.orders for update
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- --------------------------------------------------------
-- 5. AUTO-UPDATE updated_at TRIGGER
-- --------------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_updated_at
  before update on public.orders
  for each row
  execute function public.handle_updated_at();


-- --------------------------------------------------------
-- 6. PLACE ORDER — Atomic RPC
--    Decrements donation servings, creates the order row,
--    and marks the donation 'claimed' if servings hit 0.
--    Uses SECURITY DEFINER so it can update donations the
--    calling user doesn't own, while auth.uid() still
--    identifies the caller.
-- --------------------------------------------------------

create or replace function public.place_order(
  p_donation_id      uuid,
  p_servings         int,
  p_delivery_method  text,
  p_delivery_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available int;
  v_order_id  uuid;
begin
  -- Validate inputs
  if p_delivery_method not in ('pickup', 'delivery') then
    raise exception 'Invalid delivery method: %', p_delivery_method;
  end if;
  if p_servings < 1 then
    raise exception 'Must request at least 1 serving';
  end if;

  -- Lock the donation row to prevent concurrent over-ordering
  select servings into v_available
    from donations
   where id = p_donation_id
     and status = 'available'
  for update;

  if not found then
    raise exception 'Donation not found or no longer available';
  end if;
  if v_available < p_servings then
    raise exception 'Not enough servings available (requested %, available %)',
      p_servings, v_available;
  end if;

  -- Decrement servings; mark 'claimed' when none remain
  update donations
     set servings = servings - p_servings,
         status   = case
                      when servings - p_servings <= 0 then 'claimed'
                      else status
                    end
   where id = p_donation_id;

  -- Create the order
  insert into orders (donation_id, user_id, servings, delivery_method, delivery_address)
  values (p_donation_id, auth.uid(), p_servings, p_delivery_method, p_delivery_address)
  returning id into v_order_id;

  return v_order_id;
end;
$$;

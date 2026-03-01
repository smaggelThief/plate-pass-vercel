-- ============================================================
-- Plate Pass — Supabase Schema
-- Run this file in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. PROFILES
-- Mirrors auth.users so we can query role info with RLS.
create table if not exists public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  role       text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);


-- 2. DONATIONS
create table if not exists public.donations (
  id              uuid default gen_random_uuid() primary key,
  restaurant_id   uuid references auth.users on delete cascade not null,
  dish_name       text not null,
  servings        int  not null,
  allergens       text,
  cuisine         text,
  location        text not null,
  status          text default 'available' not null,
  pickup_start    timestamptz,
  pickup_end      timestamptz,
  created_at      timestamptz default now()
);

alter table public.donations enable row level security;

-- Any authenticated user can browse available donations (needed by User + Volunteer views later)
create policy "Authenticated users can read all donations"
  on public.donations for select
  to authenticated
  using (true);

-- Only the owning restaurant can create donations
create policy "Restaurants can insert their own donations"
  on public.donations for insert
  to authenticated
  with check (auth.uid() = restaurant_id);

-- Only the owning restaurant can update their donations
create policy "Restaurants can update their own donations"
  on public.donations for update
  to authenticated
  using (auth.uid() = restaurant_id);

-- Only the owning restaurant can delete their donations
create policy "Restaurants can delete their own donations"
  on public.donations for delete
  to authenticated
  using (auth.uid() = restaurant_id);

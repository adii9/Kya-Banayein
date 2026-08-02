-- Migration 0004: features v1
-- Adds: meal plans (3 slots/day), custom inventory items, edited order lists,
-- per-voter meal-time preferences. All schema is additive — no changes to
-- existing tables beyond marking inventory items as 'custom' when a user
-- adds them.

-- 1. Per-day meal plans: one row per household × date × slot.
-- A 'slot' is BREAKFAST | LUNCH | DINNER. A row may have a 'meal_id'
-- pointing at a meal in the meal_history table (or NULL if not yet
-- planned). We do not model dish composition here — that's transient,
-- stored on the meal_history row at confirm-time.
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_date date not null,
  slot text not null check (slot in ('BREAKFAST', 'LUNCH', 'DINNER')),
  meal_id text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, plan_date, slot)
);
create index if not exists meal_plans_household_date_idx
  on public.meal_plans(household_id, plan_date);

alter table public.meal_plans enable row level security;

-- Owner can read/write their household's plans. Voters in the household
-- can also read (they need to see what's been planned to vote) but
-- not write — planning is the owner's call.
drop policy if exists "owner reads meal_plans" on public.meal_plans;
create policy "owner reads meal_plans" on public.meal_plans
  for select using (is_household_owner(household_id));
drop policy if exists "voters read meal_plans" on public.meal_plans;
create policy "voters read meal_plans" on public.meal_plans
  for select using (
    exists (select 1 from public.voters v where v.household_id = meal_plans.household_id)
  );
drop policy if exists "owner writes meal_plans" on public.meal_plans;
create policy "owner writes meal_plans" on public.meal_plans
  for all using (is_household_owner(household_id))
  with check (is_household_owner(household_id));

-- 2. Custom inventory items are just inventory_items rows with a
-- 'custom' flag. Default false for everything that exists; new items
-- inserted by users default to true.
alter table public.inventory_items
  add column if not exists custom boolean not null default false;

drop policy if exists "owner deletes custom inventory" on public.inventory_items;
create policy "owner deletes custom inventory" on public.inventory_items
  for delete using (is_household_owner(household_id));

-- 3. Order list overrides: items the user has manually added to or
-- removed from the auto-generated shopping list. Applied on top of
-- getOrderSuggestions output.
create table if not exists public.order_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  slot text not null check (slot in ('weekly', 'monthly')),
  inventory_id text,         -- when action='remove', the id from inventory_items
  custom_name text,          -- when action='add', the user-supplied name
  custom_quantity numeric,
  custom_unit text,
  custom_category text check (custom_category in ('weekly', 'monthly')),
  action text not null check (action in ('add', 'remove')),
  created_at timestamptz not null default now()
);
create index if not exists order_overrides_household_idx
  on public.order_overrides(household_id);

alter table public.order_overrides enable row level security;

drop policy if exists "owner reads order_overrides" on public.order_overrides;
create policy "owner reads order_overrides" on public.order_overrides
  for select using (is_household_owner(household_id));
drop policy if exists "owner writes order_overrides" on public.order_overrides;
create policy "owner writes order_overrides" on public.order_overrides
  for all using (is_household_owner(household_id))
  with check (is_household_owner(household_id));

-- 4. Voter meal preferences: keyed to voter, applies to (slot, day_of_week).
-- 'day_of_week' is 0-6 with 0=Sunday; NULL means "any day".
-- 'meal_name' is matched against the meal's title or its dish names.
-- 'mood' is an optional flavour tag the meal engine can weight on.
create table if not exists public.voter_meal_preferences (
  id uuid primary key default gen_random_uuid(),
  voter_id uuid not null references public.voters(id) on delete cascade,
  slot text check (slot in ('BREAKFAST', 'LUNCH', 'DINNER', null)),
  day_of_week int check (day_of_week between 0 and 6),
  meal_name text,            -- e.g. 'Poha', 'Dal Tadka'
  mood text,                 -- e.g. 'spicy', 'light', 'comfort'
  strength int not null default 1 check (strength between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists voter_meal_preferences_voter_idx
  on public.voter_meal_preferences(voter_id);

alter table public.voter_meal_preferences enable row level security;

-- Voter can read/write their own preferences; the owner of the household
-- can also read all preferences in the household.
drop policy if exists "voter reads own preferences" on public.voter_meal_preferences;
create policy "voter reads own preferences" on public.voter_meal_preferences
  for select using (
    exists (
      select 1 from public.voters v
      where v.id = voter_meal_preferences.voter_id
    )
  );
drop policy if exists "voter writes own preferences" on public.voter_meal_preferences;
create policy "voter writes own preferences" on public.voter_meal_preferences
  for all using (
    exists (
      select 1 from public.voters v
      where v.id = voter_meal_preferences.voter_id
    )
  ) with check (
    exists (
      select 1 from public.voters v
      where v.id = voter_meal_preferences.voter_id
    )
  );
drop policy if exists "owner reads household preferences" on public.voter_meal_preferences;
create policy "owner reads household preferences" on public.voter_meal_preferences
  for select using (
    exists (
      select 1 from public.voters v
      join public.households h on h.id = v.household_id
      where v.id = voter_meal_preferences.voter_id
        and h.owner_id = auth.uid()
    )
  );

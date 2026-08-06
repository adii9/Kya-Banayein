-- Migration 0014: meal_polls
-- Phase H: owner-driven voting for the Today slot canvas.
--
-- A poll is a per-day, per-slot bundle of 2..n candidate meal options.
-- Voters cast one vote per poll via the votes table. The owner finalises
-- the winner — the winning option's dishes become the slot's
-- manual_dishes so today's cook plan picks them up.
--
-- Shape of options: jsonb array, 2..6 elements, each:
--   { id: string, title: string, dishes: ManualDish[] }
-- We rely on app-layer validation plus an inline CHECK that bounds the
-- array length and that every option has an id+title. The actual
-- `dishes` sub-array is enforced upstream by meal_plan_manual_dishes_is_valid
-- on the meal_plans row that gets written when the winner is adopted.
--
-- RLS:
--   * Owners can read/write polls on their household
--   * Voters in the household can read polls (so the join screen can
--     fetch today's poll and render the ballot)

create table if not exists public.meal_polls (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_date date not null,
  slot text not null check (slot in ('BREAKFAST', 'LUNCH', 'DINNER')),
  options jsonb not null default '[]'::jsonb,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, plan_date, slot)
);

create index if not exists meal_polls_household_date_idx
  on public.meal_polls (household_id, plan_date);

alter table public.meal_polls enable row level security;

ALTER TABLE public.meal_polls
  DROP CONSTRAINT IF EXISTS meal_polls_options_check;

ALTER TABLE public.meal_polls
  ADD CONSTRAINT meal_polls_options_check
  CHECK (
    jsonb_typeof(options) = 'array'
    AND jsonb_array_length(options) BETWEEN 2 AND 6
    AND (
      SELECT bool_and(
        jsonb_typeof(elem) = 'object'
        AND elem ? 'id'
        AND jsonb_typeof(elem->'id') = 'string'
        AND length(elem->>'id') > 0
        AND elem ? 'title'
        AND jsonb_typeof(elem->'title') = 'string'
        AND length(elem->>'title') > 0
        AND elem ? 'dishes'
        AND jsonb_typeof(elem->'dishes') = 'array'
      )
      FROM jsonb_array_elements(options) AS elem
    ) IS TRUE
  );

drop policy if exists "owner reads meal_polls" on public.meal_polls;
create policy "owner reads meal_polls" on public.meal_polls
  for select using (is_household_owner(household_id));

drop policy if exists "owner writes meal_polls" on public.meal_polls;
create policy "owner writes meal_polls" on public.meal_polls
  for all using (is_household_owner(household_id))
  with check (is_household_owner(household_id));

drop policy if exists "voters read meal_polls" on public.meal_polls;
create policy "voters read meal_polls" on public.meal_polls
  for select using (
    exists (select 1 from public.voters v where v.household_id = meal_polls.household_id)
  );

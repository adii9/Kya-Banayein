-- Migration 0012: Phase E composed meals
-- The household_meals table existed in production from a prior migration
-- (no migration file in this repo) with RLS enabled but no policies,
-- so authenticated users could read but not write. This migration adds
-- the proper RLS + a CHECK constraint on the dishes JSONB shape.
--
-- Shape: array of {id, name} objects, at least 1. id is the seed DISHES
-- id (or a generated UUID for wholly-custom dishes), name is the
-- display name shown in the meal grid.
--
-- This feature lets the user compose a meal from multiple dishes
-- (e.g. "Cucumber + Salad + Anda Bhurji + Roti") and have it surface
-- alongside the curated and single-dish user_meals in the Today tab.

ALTER TABLE public.household_meals
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- Validate the dishes JSONB shape: array of {id, name} objects, at least 1.
CREATE OR REPLACE FUNCTION public.household_meal_dishes_is_valid(dishes jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT case
    when dishes is null then false
    when jsonb_typeof(dishes) <> 'array' then false
    when jsonb_array_length(dishes) = 0 then false
    else (
      select bool_and(
        jsonb_typeof(elem) = 'object'
        and elem ? 'name'
        and jsonb_typeof(elem->'name') = 'string'
        and length(elem->>'name') > 0
      )
      from jsonb_array_elements(dishes) as elem
    )
  end;
$$;

ALTER TABLE public.household_meals
  DROP CONSTRAINT IF EXISTS household_meals_dishes_check;
ALTER TABLE public.household_meals
  ADD CONSTRAINT household_meals_dishes_check
  CHECK (public.household_meal_dishes_is_valid(dishes));

-- Auto-update updated_at.
DROP TRIGGER IF EXISTS household_meals_touch_updated_at ON public.household_meals;
CREATE TRIGGER household_meals_touch_updated_at
  BEFORE UPDATE ON public.household_meals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: owner only (matches the pattern used by user_meals).
DROP POLICY IF EXISTS "household_meals select for owner" ON public.household_meals;
CREATE POLICY "household_meals select for owner" ON public.household_meals
  FOR SELECT TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "household_meals insert for owner" ON public.household_meals;
CREATE POLICY "household_meals insert for owner" ON public.household_meals
  FOR INSERT TO authenticated WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "household_meals update for owner" ON public.household_meals;
CREATE POLICY "household_meals update for owner" ON public.household_meals
  FOR UPDATE TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  ) WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "household_meals delete for owner" ON public.household_meals;
CREATE POLICY "household_meals delete for owner" ON public.household_meals
  FOR DELETE TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

COMMENT ON TABLE public.household_meals IS
  'Phase E: composed meals. Authored by the household owner; appears in the Today tab alongside user_meals (single dishes) and curated DISHES.';

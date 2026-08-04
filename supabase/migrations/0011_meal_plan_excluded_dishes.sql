-- Migration 0011: meal_plans.excluded_dishes
-- The Phase 2 dish editor in the confirmation bar lets the user toggle
-- off specific dishes ("I don't want cucumber today"). The exclusion is
-- currently in-memory only — lost on refresh. Persist as a jsonb array
-- of dish names so re-loading the plan re-applies the exclusions.
ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS excluded_dishes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- No new RLS needed: the existing meal_plans policy already controls
-- access and this is just an additional column on the same row.

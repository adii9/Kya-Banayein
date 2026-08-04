-- Migration 0008: household_dish_overrides
-- Per-household overrides for the curated DISHES list. Two flavors:
--   1. Hide: dish_id + hidden=true → exclude from this household's pool
--      (the curated row itself is never deleted).
--   2. Edit: dish_id + the full Dish payload in `override` jsonb →
--      recommendMeals uses the override fields instead of curated ones.
--
-- dish_id is the curated Dish.id ('dal-tadka', 'chicken-curry', etc.).
-- Primary key (household_id, dish_id) means a household has at most
-- one row per curated dish; hide + edit can coexist (hidden wins).

CREATE TABLE IF NOT EXISTS public.household_dish_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  dish_id text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  override jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, dish_id)
);

CREATE INDEX IF NOT EXISTS household_dish_overrides_household_id_idx
  ON public.household_dish_overrides(household_id);

ALTER TABLE public.household_dish_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household_dish_overrides select for owner" ON public.household_dish_overrides;
CREATE POLICY "household_dish_overrides select for owner" ON public.household_dish_overrides
  FOR SELECT TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "household_dish_overrides insert for owner" ON public.household_dish_overrides;
CREATE POLICY "household_dish_overrides insert for owner" ON public.household_dish_overrides
  FOR INSERT TO authenticated WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "household_dish_overrides update for owner" ON public.household_dish_overrides;
CREATE POLICY "household_dish_overrides update for owner" ON public.household_dish_overrides
  FOR UPDATE TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  ) WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "household_dish_overrides delete for owner" ON public.household_dish_overrides;
CREATE POLICY "household_dish_overrides delete for owner" ON public.household_dish_overrides
  FOR DELETE TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP TRIGGER IF EXISTS household_dish_overrides_touch_updated_at ON public.household_dish_overrides;
CREATE TRIGGER household_dish_overrides_touch_updated_at
  BEFORE UPDATE ON public.household_dish_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
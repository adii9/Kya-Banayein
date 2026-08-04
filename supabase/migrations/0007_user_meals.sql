-- Migration 0007: user_meals (user-authored dishes)
-- A user meal is a single dish the household has authored themselves.
-- Mirrors the mealEngine.Dish shape (id, name, description, time,
-- vegetarian, kind, color, ingredients[]) so it can flow through the
-- existing rendering pipeline. Surfaces on the Today tab alongside
-- curated DISHES, filtered by household vegetarian preference, and
-- participates in voting / inventory deduction / meal_history exactly
-- like a curated dish.

CREATE TABLE IF NOT EXISTS public.user_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  time integer NOT NULL DEFAULT 30,
  vegetarian boolean NOT NULL DEFAULT true,
  kind text NOT NULL DEFAULT 'main',
  color text,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_meals_household_id_idx ON public.user_meals(household_id);
CREATE INDEX IF NOT EXISTS user_meals_household_veg_idx ON public.user_meals(household_id, vegetarian);

ALTER TABLE public.user_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_meals select for owner" ON public.user_meals;
CREATE POLICY "user_meals select for owner" ON public.user_meals
  FOR SELECT TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "user_meals insert for owner" ON public.user_meals;
CREATE POLICY "user_meals insert for owner" ON public.user_meals
  FOR INSERT TO authenticated WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "user_meals update for owner" ON public.user_meals;
CREATE POLICY "user_meals update for owner" ON public.user_meals
  FOR UPDATE TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  ) WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "user_meals delete for owner" ON public.user_meals;
CREATE POLICY "user_meals delete for owner" ON public.user_meals
  FOR DELETE TO authenticated USING (
    household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid())
  );

-- Auto-update updated_at on UPDATE. We use the shared touch_updated_at()
-- function that already exists in the public schema (created in 0001).
DROP TRIGGER IF EXISTS user_meals_touch_updated_at ON public.user_meals;
CREATE TRIGGER user_meals_touch_updated_at
  BEFORE UPDATE ON public.user_meals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
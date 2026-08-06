-- Migration 0013: meal_plans.manual_dishes
-- The new Today UX replaces the auto-suggested meal grid with a per-slot
-- "what's cooking" canvas. The user picks 1..n dishes from their recipes,
-- composed meals, or the curated list, and the picks are persisted on the
-- existing meal_plans row instead of in a separate join table.
--
-- Why a column not a join table: meal_plans has a unique constraint
-- (household_id, plan_date, slot), so one slot = one row. The earlier
-- schema modelled a slot as pointing at a single "meal" (a curated bundle
-- from the engine); the new schema treats a slot as a free-form basket
-- of dishes the user has chosen. The existing meal_id column is kept for
-- backwards compat with engine-driven plans (chat intent still writes
-- meal_id = matchMeal.id) and for the upcoming voting flow, which needs
-- to know which meal option voters are picking from.
--
-- When manual_dishes is non-empty, it represents the active picks for
-- that slot and meal_id may be null. When meal_id is set and
-- manual_dishes is empty, the slot still holds the engine-bundled meal
-- (legacy behaviour, kept intact for chat-driven flows).
--
-- Shape: jsonb array of {dish_id, name, source} where source is one of:
--   'user_meal'        — a row in user_meals (dish_id = user_meals.id)
--   'household_meal'   — a composed meal (dish_id = household_meals.id)
--   'curated'          — a curated DISHES row (dish_id = DISHES.id)
--   'adhoc'            — free-text name only (dish_id is null)

ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS manual_dishes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Validate the manual_dishes JSONB shape: array of objects, each with a
-- non-empty `name` string, and a `source` ∈ the four enum values.
-- dish_id may be null (only for source = 'adhoc').
CREATE OR REPLACE FUNCTION public.meal_plan_manual_dishes_is_valid(dishes jsonb)
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
        and elem ? 'source'
        and jsonb_typeof(elem->'source') = 'string'
        and elem->>'source' in ('user_meal', 'household_meal', 'curated', 'adhoc')
        and (
          (elem->>'source') = 'adhoc'
          or (
            elem ? 'dish_id'
            and jsonb_typeof(elem->'dish_id') in ('string', 'null')
          )
        )
      )
      from jsonb_array_elements(dishes) as elem
    )
  end;
$$;

ALTER TABLE public.meal_plans
  DROP CONSTRAINT IF EXISTS meal_plans_manual_dishes_check;
ALTER TABLE public.meal_plans
  ADD CONSTRAINT meal_plans_manual_dishes_check
  CHECK (public.meal_plan_manual_dishes_is_valid(manual_dishes) OR manual_dishes = '[]'::jsonb);

-- No new RLS needed: the existing owner-writes-meal_plans policy
-- already covers this column (it's an additional column on the same row).

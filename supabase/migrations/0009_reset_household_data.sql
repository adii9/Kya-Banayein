-- Migration 0009: reset_household_data RPC
-- B4 fix: lets the owner wipe their household's operational data
-- (inventory, voters, votes, meal plans, meal history, voter
-- preferences, user meals, curated-dish overrides, order overrides)
-- in one atomic transaction — without deleting the household row
-- itself, so the user stays signed in and can re-onboard.
--
-- SECURITY INVOKER + is_household_owner() guard inside the body, so
-- the function fails closed if RLS is ever loosened on the underlying
-- tables. EXECUTE is granted only to authenticated.

CREATE OR REPLACE FUNCTION public.reset_household_data(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_household_owner(p_household_id) THEN
    RAISE EXCEPTION 'not the household owner' USING ERRCODE = '42501';
  END IF;

  -- Order matters: votes + voter_meal_preferences depend on voters,
  -- so voters must be cleared after them.
  DELETE FROM public.votes WHERE household_id = p_household_id;
  DELETE FROM public.voter_meal_preferences
    WHERE voter_id IN (SELECT id FROM public.voters WHERE household_id = p_household_id);
  DELETE FROM public.voters WHERE household_id = p_household_id;
  DELETE FROM public.meal_history WHERE household_id = p_household_id;
  DELETE FROM public.meal_plans WHERE household_id = p_household_id;
  DELETE FROM public.order_overrides WHERE household_id = p_household_id;
  DELETE FROM public.inventory_items WHERE household_id = p_household_id;
  DELETE FROM public.user_meals WHERE household_id = p_household_id;
  DELETE FROM public.household_dish_overrides WHERE household_id = p_household_id;
  -- legacy / unused table — clear if it has any rows.
  DELETE FROM public.household_meals WHERE household_id = p_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_household_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_household_data(uuid) TO authenticated;
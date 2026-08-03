-- Migration 0010: household.suggestion_count + dishes_per_meal
-- Today tab "Options to show" and "Dishes per meal" were previously
-- only stored in localStorage. They now sync to the household row so
-- the user's settings survive a device switch and a fresh sign-in.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS suggestion_count int NOT NULL DEFAULT 3
    CHECK (suggestion_count BETWEEN 1 AND 12);
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS dishes_per_meal int NOT NULL DEFAULT 3
    CHECK (dishes_per_meal BETWEEN 1 AND 6);

-- No new RLS needed: the existing household policy already controls access
-- and these are just additional columns on the same row.

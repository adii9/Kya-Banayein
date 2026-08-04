-- Migration 0006: per-meal-time household dislikes
-- Adds a jsonb column 'dislikes' to public.households, defaulting to '[]'.
-- Each element is {name: string, slot?: 'BREAKFAST'|'LUNCH'|'DINNER',
-- day_of_week?: 0-6}. Absence of slot means "any time" (backwards-compatible
-- with the old flat dislike list).

-- 1. Add the column.
alter table public.households
  add column if not exists dislikes jsonb not null default '[]'::jsonb;

-- 2. Validate the shape via a function (CHECK constraints can't easily
-- iterate over jsonb array elements; a function is the cleanest path).
create or replace function public.household_dislikes_is_valid(dislikes jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when dislikes is null then true
    when jsonb_typeof(dislikes) <> 'array' then false
    when jsonb_array_length(dislikes) = 0 then true  -- empty array is OK
    else (
      select bool_and(
        jsonb_typeof(elem) = 'object'
        and elem ? 'name'
        and jsonb_typeof(elem->'name') = 'string'
        and length(elem->>'name') > 0
        and (elem->'slot' is null or elem->>'slot' in ('BREAKFAST','LUNCH','DINNER'))
        and (
          elem->'day_of_week' is null
          or (jsonb_typeof(elem->'day_of_week') = 'number' and (elem->>'day_of_week')::int between 0 and 6)
        )
      )
      from jsonb_array_elements(dislikes) as elem
    )
  end;
$$;

-- 3. Add a CHECK constraint using the function.
alter table public.households
  drop constraint if exists households_dislikes_shape_check;
alter table public.households
  add constraint households_dislikes_shape_check
  check (public.household_dislikes_is_valid(dislikes));

-- No new RLS needed: the existing household policy covers it.

-- Migration 0017: tighten anon access. Audit (Aug 2026) found:
--   * 0015_anon_voter_voting.sql added `for select to anon using (true)` on
--     voters. That's the broadest possible predicate. Combined with the
--     `exists(select 1 from voters v where v.household_id = <other table>)`
--     predicates in 0003's "voters read household inventory", 0004's
--     "voters read meal_plans", and 0014's "voters read meal_polls",
--     anon could enumerate EVERY household's voters, inventory_items,
--     meal_plans, and meal_polls via the REST API.
--
-- Plan:
--   1. Drop the broad anon SELECT on voters.
--   2. Tighten the three "voters read ..." policies to require
--      auth.role() = 'authenticated' (they were designed for the
--      authenticated voter flow on the owner's device — anon should
--      never reach them).
--   3. Add two SECURITY DEFINER RPCs that take a join_code and return
--      only the slice of data the anon voter landing page needs:
--        a. anon_lookup_voters_by_join_code(p_code) → voter roster
--        b. anon_fetch_today_poll(p_code) → today's open poll for the
--           household tied to p_code (options + closed_at; no voter ids)
--   4. The anon voter write side (0015's INSERT/UPDATE on votes) stays
--      intact — the WITH CHECK still ties (voter_id, household_id) to
--      a real voters row, so a forged write requires enumerating voters
--      first. With the RPC-only anon read path, an attacker can no longer
--      enumerate, only guess voter names one at a time via the join screen.
--
-- Effect: anon SELECTs on voters, inventory_items, meal_plans,
-- meal_polls return zero rows. The voter join flow still works because
-- the App now calls the two RPCs instead of reading those tables directly.

-- ---------------------------------------------------------------------------
-- 1. Drop the broad anon SELECT on voters.
-- ---------------------------------------------------------------------------
drop policy if exists "anon reads voters for join flow" on public.voters;

-- ---------------------------------------------------------------------------
-- 2. Tighten the three cross-table "voters read ..." policies to
--    authenticated-only. They were scoped by `exists(select 1 from voters ...)`
--    which an anon attacker could satisfy by enumerating voters via the
--    broad anon SELECT. Now that voters is anon-locked, the only way to
--    satisfy these predicates is to be signed in (auth.role() = 'authenticated').
--
-- The authenticated voter flow on the owner's device still passes:
-- auth.uid() is set, and `exists(select 1 from voters where household_id = ...)`
-- is true for the household the signed-in user is a voter of.
-- ---------------------------------------------------------------------------

-- 0003: inventory_items — was OR(auth.uid() in owners, exists(voters in same hh))
drop policy if exists "voters read household inventory" on public.inventory_items;
create policy "voters read household inventory" on public.inventory_items
  for select to authenticated using (
    auth.uid() in (
      select owner_id from public.households where id = household_id
    )
    or exists (
      select 1 from public.voters v
      where v.household_id = inventory_items.household_id
    )
  );

-- 0004: meal_plans
drop policy if exists "voters read meal_plans" on public.meal_plans;
create policy "voters read meal_plans" on public.meal_plans
  for select to authenticated using (
    exists (select 1 from public.voters v where v.household_id = meal_plans.household_id)
  );

-- 0014: meal_polls
drop policy if exists "voters read meal_polls" on public.meal_polls;
create policy "voters read meal_polls" on public.meal_polls
  for select to authenticated using (
    exists (select 1 from public.voters v where v.household_id = meal_polls.household_id)
  );

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER RPCs for the anon voter landing flow.
-- ---------------------------------------------------------------------------

-- 3a. Voter roster lookup, scoped by join code.
-- Returns { id, name } for every voter in the household whose join_code
-- matches. The join_code lookup is gated by the existing 0016 policy on
-- households (anon SELECT allowed when join_code IS NOT NULL). We look up
-- the household id inside the RPC body so the caller never sees other
-- households. Returns empty rows (not an error) for an unknown code so we
-- don't leak which codes exist vs not.
create or replace function public.anon_lookup_voters_by_join_code(p_code text)
returns table (id uuid, name text)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select h.id into v_household_id
  from public.households h
  where h.join_code = p_code
  limit 1;

  if v_household_id is null then
    return;
  end if;

  return query
    select v.id, v.name
    from public.voters v
    where v.household_id = v_household_id
    order by v.created_at nulls last, v.name;
end;
$$;

grant execute on function public.anon_lookup_voters_by_join_code(text) to anon;

-- 3b. Today's poll lookup, scoped by join code.
-- Returns the first open poll for the household tied to p_code on the
-- given plan_date (default = IST today computed by the caller — RPC takes
-- a YYYY-MM-DD string). Returns options + closed_at but NOT voter ids
-- (those stay in the votes table, which anon can't read).
create or replace function public.anon_fetch_today_poll(p_code text, p_date date)
returns table (
  id uuid,
  household_id uuid,
  plan_date date,
  slot text,
  options jsonb,
  closed_at timestamptz
)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select h.id into v_household_id
  from public.households h
  where h.join_code = p_code
  limit 1;

  if v_household_id is null then
    return;
  end if;

  return query
    select p.id, p.household_id, p.plan_date, p.slot, p.options, p.closed_at
    from public.meal_polls p
    where p.household_id = v_household_id
      and p.plan_date = p_date
      and p.closed_at is null
    order by p.slot
    limit 1;
end;
$$;

grant execute on function public.anon_fetch_today_poll(text, date) to anon;

-- 3c. Tally lookup, scoped by join code.
-- Returns the {voter_id → option_id} map for the household's open poll
-- on p_date. Voter ids are exposed because the voter themselves needs
-- to know "is my pick already cast" (VoterDashboard compares
-- tally[voter.id] to opt.id). Anon can't enumerate voters (RPC above is
-- the only anon read), and they can't enumerate other households'
-- tallies because the join_code gates everything.
create or replace function public.anon_fetch_today_tally(p_code text, p_date date)
returns table (voter_id uuid, option_id text)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_household_id uuid;
  v_poll_id uuid;
begin
  select h.id into v_household_id
  from public.households h
  where h.join_code = p_code
  limit 1;

  if v_household_id is null then
    return;
  end if;

  -- Use the first open poll for the day (same scope as 3b).
  select p.id into v_poll_id
  from public.meal_polls p
  where p.household_id = v_household_id
    and p.plan_date = p_date
    and p.closed_at is null
  order by p.slot
  limit 1;

  if v_poll_id is null then
    return;
  end if;

  return query
    select v.voter_id,
      substring(v.meal_id from 'poll-[^:]+:opt:(.+)$') as option_id
    from public.votes v
    where v.household_id = v_household_id
      and v.poll_date = p_date
      and v.meal_id like 'poll-' || v_poll_id::text || ':opt:%';
end;
$$;

grant execute on function public.anon_fetch_today_tally(text, date) to anon;
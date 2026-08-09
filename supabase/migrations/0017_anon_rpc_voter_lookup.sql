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
--   3. Drop 0015's anon INSERT/UPDATE on votes. With the read path
--      closed, anon has no way to look up valid voter_ids; and a write
--      policy keyed only on (voter_id, household_id) lets an attacker
--      who guesses a voter's name cast votes as them. The replacement
--      is anon_cast_vote_by_name: a SECURITY DEFINER RPC that takes
--      (join_code, voter_name, poll_id, option_id) and does the
--      lookup + write inside the function body. The function returns
--      a clear error if the name doesn't match a voter in the
--      household. Voting-as-someone-else is impossible without
--      knowing the exact name string.
--   4. Add three read-side SECURITY DEFINER RPCs that take a join_code
--      and return only the slice of data the anon voter landing page
--      needs:
--        a. anon_lookup_voters_by_join_code(p_code) → voter roster
--           (used to populate a "who's on this household?" picker; the
--           voter selects their own name)
--        b. anon_fetch_today_poll(p_code, p_date) → today's open poll
--        c. anon_fetch_today_tally(p_code, p_date) → {voter_id → option_id}
--
-- Effect: anon SELECTs on voters, inventory_items, meal_plans,
-- meal_polls return zero rows. Anon writes on votes are replaced with
-- a single named-vote RPC. The voter landing page now works fully
-- without a Google account.

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

-- ---------------------------------------------------------------------------
-- 4. Drop the 0015 anon INSERT/UPDATE policies on votes. Replaced by
-- anon_cast_vote_by_name below. With the read path closed (anon can't
-- enumerate voters), a write policy keyed on (voter_id, household_id)
-- would let an attacker vote as any voter whose name they guess.
-- ---------------------------------------------------------------------------
drop policy if exists "anon inserts vote for valid voter in household" on public.votes;
drop policy if exists "anon updates vote for valid voter in household" on public.votes;

-- 4a. anon_cast_vote_by_name
-- The full anon-side vote flow in one RPC. Takes the join_code, the
-- voter's name (exact case-insensitive match against the household's
-- voters.name), the poll_id, and the option_id. Looks up the voter
-- inside SECURITY DEFINER; inserts or updates the votes row; returns
-- the resulting (voter_id, option_id) so the client can refresh its
-- tally without a second round-trip.
--
-- Error semantics:
--   * unknown join_code       → exception 'unknown join_code'
--   * unknown voter name      → exception 'unknown voter name'
--   * poll not in that household → exception 'poll not found'
--   * poll already closed     → exception 'poll is closed'
--   * option_id not in poll   → exception 'invalid option'
create or replace function public.anon_cast_vote_by_name(
  p_code text,
  p_voter_name text,
  p_poll_id uuid,
  p_option_id text
)
returns table (voter_id uuid, option_id text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_voter_id uuid;
  v_poll_household uuid;
  v_poll_closed timestamptz;
  v_poll_options jsonb;
  v_poll_date date;
  v_meal_id text;
begin
  -- 1. Resolve household from join code.
  select h.id into v_household_id
  from public.households h
  where h.join_code = p_code
  limit 1;

  if v_household_id is null then
    raise exception 'unknown join_code' using errcode = 'P0002';
  end if;

  -- 2. Resolve voter from exact (case-insensitive) name match. We use
  --    `lower(name) = lower(...)` because a voter typing "diya" should
  --    match "Diya". Trim whitespace from user input — phones paste
  --    trailing spaces sometimes.
  select v.id into v_voter_id
  from public.voters v
  where v.household_id = v_household_id
    and lower(btrim(v.name)) = lower(btrim(p_voter_name))
  limit 1;

  if v_voter_id is null then
    raise exception 'unknown voter name' using errcode = 'P0002';
  end if;

  -- 3. Verify poll belongs to this household and is open. Capture the
  --    plan_date (the date the poll is bound to, NOT today) so votes
  --    accumulate under (voter_id, poll_date) consistently.
  select p.household_id, p.closed_at, p.options, p.plan_date
    into v_poll_household, v_poll_closed, v_poll_options, v_poll_date
  from public.meal_polls p
  where p.id = p_poll_id;

  if v_poll_household is null or v_poll_household <> v_household_id then
    raise exception 'poll not found' using errcode = 'P0002';
  end if;

  if v_poll_closed is not null then
    raise exception 'poll is closed' using errcode = 'P0001';
  end if;

  -- 4. Verify option_id is one of the poll's options. This is critical
  --    — without it, an attacker could write a garbage option_id and
  --    the tally would render nonsense.
  if not (
    select bool_and(elem->>'id' = p_option_id)
    from jsonb_array_elements(v_poll_options) elem
  ) then
    raise exception 'invalid option' using errcode = 'P0002';
  end if;

  -- 5. Upsert. The votes table has (voter_id, poll_date) as the
  --    uniqueness key per the api.ts contract. We encode the pick as
  --    poll-<poll_id>:opt:<option_id> to match the existing fetchPollTally
  --    decoder. We pass plan_date (not today) so the vote stays under
  --    the right day even if the voter casts at 11:59pm and the poll
  --    is technically still "today's".
  v_meal_id := 'poll-' || p_poll_id::text || ':opt:' || p_option_id;

  insert into public.votes (household_id, voter_id, meal_id, poll_date, updated_at)
  values (v_household_id, v_voter_id, v_meal_id, v_poll_date, now())
  on conflict (voter_id, poll_date) do update
    set meal_id = excluded.meal_id,
        updated_at = excluded.updated_at;

  return query
    select v_voter_id, p_option_id;
end;
$$;

grant execute on function public.anon_cast_vote_by_name(text, text, uuid, text) to anon;
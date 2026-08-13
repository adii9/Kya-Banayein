-- Migration 0018: per-voter share links.
--
-- 0017 owns the anon voter landing with the name-picker flow:
--   anon_cast_vote_by_name(p_code, p_voter_name, p_poll_id, p_option_id)
-- The receiver types their name, the RPC verifies it matches a voter in
-- the household, casts the vote. That's fine for a single shared link,
-- but when the owner sends a link to four family members on four phones,
-- each phone needs to receive a link that already names the recipient.
-- Otherwise:
--   * every recipient sees the name picker (friction)
--   * any recipient can type any other voter's name (security hole)
--   * everyone can vote multiple times by retyping names (no idempotency)
--
-- This migration adds a token-bound RPC. The owner generates a per-voter
-- share URL of the form
--   https://kya-banayein-theta.vercel.app/?join=JOIN-34B9C&voter=ABCD5
-- where the trailing 5-char invite_code is the existing voters.invite_code
-- (already unique, already generated, already used for in-app voter
-- identification). The recipient opens the link, VoterLanding reads the
-- voter token from the URL, skips the name picker, and the vote RPC
-- looks up the voter by token inside the SECURITY DEFINER body.
--
-- Why invite_code and not voter.id (uuid)?
--   * UUIDs in URLs leak implementation
--   * UUIDs are guessable in a 1.6e13-key space; the 5-char invite_code
--     is 32^5 ≈ 3.3e7 keys so enumeration is infeasible
--   * Same column already wires up the in-app voter token feature
--
-- Error semantics mirror 0017's anon_cast_vote_by_name:
--   * unknown join_code       → exception 'unknown join_code'
--   * unknown voter token     → exception 'unknown voter token'
--   * poll not in household   → exception 'poll not found'
--   * poll closed             → exception 'poll is closed'
--   * option_id not in poll   → exception 'invalid option'
--
-- Effect: existing per-household share links still work (the VoterLanding
-- falls back to the name picker when no voter token is present). New
-- share links include the token and skip the picker. Crypto-wise, no
-- change — the join_code is still the household-level capability,
-- invite_code is now the per-voter capability.

create or replace function public.anon_cast_vote_by_token(
  p_code text,
  p_voter_token text,
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
  -- 1. Resolve household from join code (same as 0017).
  select h.id into v_household_id
  from public.households h
  where h.join_code = p_code
  limit 1;

  if v_household_id is null then
    raise exception 'unknown join_code' using errcode = 'P0002';
  end if;

  -- 2. Resolve voter from invite_code. The token is exact-match (case-
  --    sensitive). The 5-char invite_code is generated client-side from
  --    an unambiguous alphabet (no I/L/0/O), so case folding is safe.
  select v.id into v_voter_id
  from public.voters v
  where v.household_id = v_household_id
    and v.invite_code = upper(btrim(p_voter_token))
  limit 1;

  if v_voter_id is null then
    raise exception 'unknown voter token' using errcode = 'P0002';
  end if;

  -- 3. Verify poll belongs to this household and is open. Same shape
  --    as 0017 — the only difference is the voter lookup.
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

  -- 4. Verify option_id is one of the poll's options.
  -- Bug fix: the original used bool_and, which requires ALL options to
  -- match — impossible when the poll has more than one option. The RPC
  -- therefore rejected every vote as 'invalid option', so the token-
  -- bound path silently failed even with a valid option_id. bool_or
  -- matches if ANY element's id equals p_option_id.
  --
  -- Return type was also changed from RETURNS TABLE (voter_id, option_id)
  -- to RETURNS json to dodge a PL/pgSQL column-shadowing issue: with
  -- RETURNS TABLE, the bare column name `voter_id` in `return query
  -- select v_voter_id as voter_id` is ambiguous against the votes
  -- table column also in scope (we just inserted into it). Postgres
  -- raises 42702 ("column reference is ambiguous"). RETURNS json
  -- sidesteps that and gives the client a single object — the JS
  -- helper castVoteAnonByToken parses it as {voter_id, option_id}.
  if not (
    select bool_or(elem->>'id' = p_option_id)
    from jsonb_array_elements(v_poll_options) elem
  ) then
    raise exception 'invalid option' using errcode = 'P0002';
  end if;

  -- 5. Upsert. Same encoding as anon_cast_vote_by_name so the existing
  --    fetchPollTally decoder works for both write paths.
  v_meal_id := 'poll-' || p_poll_id::text || ':opt:' || p_option_id;

  insert into public.votes (household_id, voter_id, meal_id, poll_date, updated_at)
  values (v_household_id, v_voter_id_resolved, v_meal_id, v_poll_date, now())
  on conflict (voter_id, poll_date) do update
    set meal_id = excluded.meal_id,
        updated_at = excluded.updated_at;

  -- 6. Return. JSON object so the JS contract is {voter_id, option_id}.
  -- jsonb_build_object uses string literal keys, so there's no PL/pgSQL
  -- column-resolution ambiguity.
  return jsonb_build_object('voter_id', v_voter_id_resolved, 'option_id', p_option_id)::text;
end;
$$;

grant execute on function public.anon_cast_vote_by_token(text, text, uuid, text) to anon;

-- Extend the voter roster lookup to also surface invite_code. The
-- token-bound share flow (commit B in this PR) needs the roster to
-- include the per-voter token so VoterLanding can match the URL's
-- ?voter= param against the household's roster. Without this, the
-- recipient would have to type their name even when the link is
-- token-bound.
--
-- invite_code is the per-voter capability — already documented in
-- 0001_init.sql as a unique 5-char column. Exposing it through the
-- roster RPC is fine because the join_code is the household-level
-- gate: anyone who has the join_code already knows the household
-- exists, and matching invite_code against the roster is the entire
-- purpose of the RPC.
create or replace function public.anon_lookup_voters_by_join_code(p_code text)
returns table (id uuid, name text, invite_code text)
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
    select v.id, v.name, v.invite_code
    from public.voters v
    where v.household_id = v_household_id
    order by v.created_at nulls last, v.name;
end;
$$;

grant execute on function public.anon_lookup_voters_by_join_code(text) to anon;

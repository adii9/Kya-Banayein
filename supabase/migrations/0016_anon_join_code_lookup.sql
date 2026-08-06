-- Migration 0016: anon can look up household by join code.
--
-- Phase H v1 ships a VoterLanding page where voters hit a ?join=<code>
-- link and don't sign in. The existing "join code lookup" policy on
-- households was scoped to authenticated only, so anon SELECTs returned
-- zero rows. That made the voter page display "this join link isn't valid
-- anymore" even when the link was correct.
--
-- Extend the policy to include the anon role. The USING clause stays the
-- same (join_code IS NOT NULL) — anyone with a code can look up the
-- household's id + name. We never expose owner_id, region, or other
-- private columns via the REST API.

drop policy if exists "join code lookup" on public.households;
create policy "join code lookup" on public.households
  for select to anon, authenticated using (join_code is not null);
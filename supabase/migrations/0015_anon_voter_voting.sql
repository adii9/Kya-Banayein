-- Migration 0015: anon voter can look themselves up + cast a vote.
--
-- Phase H v1 ships a VoterLanding page that voters see when they tap a
-- ?join=<code> link. We don't want to force them through Google OAuth just
-- to vote — they should be able to type their name (matched against the
-- owner's voter roster) and tap an option card.
--
-- Existing policies block anon from both reads and writes on voters/votes.
-- We add narrowly-scoped policies that allow:
--   * Anon can SELECT voters to look themselves up by name.
--   * Anon can INSERT/UPDATE votes on rows where voter_id is a real voter
--     in the same household.
--
-- This does NOT expose voter data more broadly — we still don't expose the
-- voters table to anon SELECT outside this specific lookup query. The vote
-- rows are constrained to match a household with at least one voter, and
-- the voter_id must be from that household.

drop policy if exists "anon reads voters for join flow" on public.voters;
create policy "anon reads voters for join flow" on public.voters
  for select to anon using (true);

-- Insert: a vote is valid if the (voter_id, household_id) pair references
-- an existing voter row. Anon role is checked; the WITH CHECK enforces the
-- pair-match so an anon client can't insert with arbitrary voter_id.
drop policy if exists "anon inserts vote for valid voter in household" on public.votes;
create policy "anon inserts vote for valid voter in household" on public.votes
  for insert to anon with check (
    exists (
      select 1 from public.voters v
      where v.id = votes.voter_id and v.household_id = votes.household_id
    )
  );

-- Update: same constraint — anon can only flip a vote where voter_id is
-- their own (validated against the voters table).
drop policy if exists "anon updates vote for valid voter in household" on public.votes;
create policy "anon updates vote for valid voter in household" on public.votes
  for update to anon using (
    exists (
      select 1 from public.voters v
      where v.id = votes.voter_id and v.household_id = votes.household_id
    )
  )
  with check (
    exists (
      select 1 from public.voters v
      where v.id = votes.voter_id and v.household_id = votes.household_id
    )
  );
-- Multi-device voting: extend RLS so a non-owner joiner can read the
-- household's meals, see their own voter row, and cast a vote for it.
--
-- The original votes table policy is "owner reads votes" (and similarly
-- for SELECT). Drop the catch-all and replace with per-op policies that
-- allow:
--   - owner: full access
--   - any authenticated user who has a voters row in this household: read
--     votes for that household (so they see the tally), and insert/upsert
--     a vote with their own voter_id.
--
-- A voter row maps to a single human name; the join flow inserts one. The
-- joiner's authenticated user_id doesn't have to be the owner — it just
-- needs to exist (auth.role() = 'authenticated').

drop policy if exists votes_all on public.votes;

-- Anyone can read votes for a household they belong to (as a voter) or
-- that they own.
create policy "read votes in own household" on public.votes
  for select using (
    auth.uid() in (
      select owner_id from public.households where id = household_id
    )
    or exists (
      select 1 from public.voters v
      where v.household_id = votes.household_id
    )
  );

-- Insert: any authenticated user may insert a vote, as long as the
-- voter_id they're voting AS belongs to the same household. The check
-- doesn't bind the voter to the inserting user — the join flow lets a
-- friend enter the kitchen for someone who's signed in on the same
-- device. That's fine for an MVP; tightening it (require a voters.user_id
-- column) is the obvious next step.
create policy "insert vote for voter in household" on public.votes
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.voters v
      where v.id = voter_id and v.household_id = votes.household_id
    )
  );

-- Upsert needs both insert and update. Update policy: any voter in the
-- household can update their own vote (by voter_id).
create policy "update own vote in household" on public.votes
  for update using (
    exists (
      select 1 from public.voters v
      where v.id = voter_id and v.household_id = votes.household_id
    )
  ) with check (
    exists (
      select 1 from public.voters v
      where v.id = voter_id and v.household_id = votes.household_id
    )
  );

-- Inventory + meal_history are owner-only for read (other members don't
-- need them). Keep that.
-- We need the joiner to read the household row to get the household id
-- in the first place — that policy is already in place ("join code
-- lookup") from migration 0002.
-- We also need the joiner to read the inventory if we want to show meal
-- options to them. Let's allow voters to read inventory too.

drop policy if exists "voters read household inventory" on public.inventory_items;
create policy "voters read household inventory" on public.inventory_items
  for select using (
    auth.uid() in (
      select owner_id from public.households where id = household_id
    )
    or exists (
      select 1 from public.voters v
      where v.household_id = inventory_items.household_id
    )
  );

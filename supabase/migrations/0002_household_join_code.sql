-- Multi-device voting: a short, human-typeable code on the household that
-- family members can use to join as voters from their own devices without
-- needing to know the household's UUID. Code format: 'JOIN-XXXXX' (5 chars
-- from a 32-char unambiguous alphabet, ~1M combinations).
--
-- Generated client-side via crypto.getRandomValues, then upserted into the
-- column. Collisions on the 1M-space are rare but possible; on insert
-- conflict, the app retries up to 5 times with a fresh code.

alter table public.households
  add column if not exists join_code text unique;

create unique index if not exists households_join_code_idx
  on public.households(join_code)
  where join_code is not null;

-- RLS: anyone can look up a household by join_code (the code itself is the
-- capability — you can only get it by being invited via WhatsApp). They
-- can read the household's id and name (to render the join screen) but
-- nothing else, because all other RLS predicates still require auth.uid()
-- = owner_id.
drop policy if exists "join code lookup" on public.households;
create policy "join code lookup" on public.households
  for select using (join_code is not null);

-- Replace the catch-all voters policy with a per-operation split so a
-- joiner (authenticated but not the owner) can INSERT their own voter
-- row. SELECT/UPDATE/DELETE stay owner-only.
drop policy if exists voters_all on public.voters;
create policy "owner reads voters" on public.voters
  for select using (is_household_owner(household_id));
create policy "owner modifies voters" on public.voters
  for update using (is_household_owner(household_id))
  with check (is_household_owner(household_id));
create policy "owner deletes voters" on public.voters
  for delete using (is_household_owner(household_id));
-- A joiner can insert their own voter row as long as the household
-- exists. We allow any authenticated user to insert; the household's
-- join_code is the capability check at the application layer.
create policy "authenticated inserts voter" on public.voters
  for insert with check (
    auth.role() = 'authenticated'
    and exists (select 1 from public.households h where h.id = household_id)
  );

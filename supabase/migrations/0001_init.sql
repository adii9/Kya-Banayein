-- Kya Banayein — beta schema
-- One household per user. Multi-tenant via RLS on auth.uid() = owner_id.

-- Household
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade unique,
  name text not null default 'My Kitchen',
  region text,
  members int not null default 4 check (members between 1 and 12),
  vegetarian boolean not null default false,
  voting_enabled boolean not null default false,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists households_owner_idx on public.households(owner_id);

-- Family members who can vote (not auth users — just names + codes)
create table if not exists public.voters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists voters_household_idx on public.voters(household_id);
create index if not exists voters_code_idx on public.voters(invite_code);

-- Kitchen inventory
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  quantity numeric not null default 0,
  unit text not null default 'g',
  category text not null check (category in ('weekly', 'monthly')),
  reorder_at numeric not null default 0,
  target_stock numeric not null default 1000
);

create index if not exists inventory_household_idx on public.inventory_items(household_id);

-- Confirmed meals (history)
create table if not exists public.meal_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_id text not null,
  dishes jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz not null default now()
);

create index if not exists meal_history_household_idx on public.meal_history(household_id);

-- Votes (one per voter per day)
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  voter_id uuid not null references public.voters(id) on delete cascade,
  meal_id text not null,
  poll_date date not null default current_date,
  updated_at timestamptz not null default now(),
  unique (voter_id, poll_date)
);

create index if not exists votes_household_idx on public.votes(household_id);
create index if not exists votes_date_idx on public.votes(household_id, poll_date);

-- Trigger: keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_households on public.households;
create trigger touch_households before update on public.households
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_votes on public.votes;
create trigger touch_votes before update on public.votes
  for each row execute function public.touch_updated_at();

-- Row Level Security
alter table public.households enable row level security;
alter table public.voters enable row level security;
alter table public.inventory_items enable row level security;
alter table public.meal_history enable row level security;
alter table public.votes enable row level security;

-- Helper: is the current user the owner of this household?
create or replace function public.is_household_owner(household uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.households where id = household and owner_id = auth.uid());
$$;

-- households: owner only
drop policy if exists households_select on public.households;
drop policy if exists households_insert on public.households;
drop policy if exists households_update on public.households;
drop policy if exists households_delete on public.households;

create policy households_select on public.households for select using (owner_id = auth.uid());
create policy households_insert on public.households for insert with check (owner_id = auth.uid());
create policy households_update on public.households for update using (owner_id = auth.uid());
create policy households_delete on public.households for delete using (owner_id = auth.uid());

-- voters, inventory, meal_history, votes: scoped via is_household_owner
drop policy if exists voters_all on public.voters;
drop policy if exists inventory_all on public.inventory_items;
drop policy if exists meal_history_all on public.meal_history;
drop policy if exists votes_all on public.votes;

create policy voters_all on public.voters for all using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy inventory_all on public.inventory_items for all using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy meal_history_all on public.meal_history for all using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy votes_all on public.votes for all using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));

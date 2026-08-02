-- Migration 0005: inventory_groups
-- Adds a 'group' column to inventory_items so the onboarding wizard can
-- pre-categorize items (Atta & Rice, Daals & Pulses, Spices & Masalas,
-- Oils & Dairy, Fresh Vegetables) without overloading the existing
-- 'category' column which already means reorder-frequency
-- ('weekly' | 'monthly').

alter table public.inventory_items
  add column if not exists "group" text;

-- Index by group for fast group-by queries in the onboarding UI.
create index if not exists inventory_items_group_idx
  on public.inventory_items("group");

-- No new RLS needed: the existing owner-only policy on inventory_items
-- already covers this. Joins to households via the existing is_household_owner
-- predicate are unchanged.

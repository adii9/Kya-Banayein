import type { InventoryItem, Dish } from './mealEngine'
import { DEFAULT_INVENTORY } from './mealEngine'
import { supabase } from './supabase'
import { istDateKey } from './dates'

// Generates a 'JOIN-XXXXX' household join code. ~1M combinations (32^5);
// on the rare chance of collision, the caller retries. We exclude
// visually-ambiguous chars (0/O, 1/I/L) so codes are easy to read aloud.
const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const generateJoinCode = (): string => {
  const arr = new Uint8Array(5)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < 5; i += 1) arr[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < 5; i += 1) out += JOIN_ALPHABET[arr[i] % JOIN_ALPHABET.length]
  return `JOIN-${out}`
}

// One thing the household doesn't eat. slot is optional — when absent the
// dislike applies at any time. dayOfWeek is also optional (0=Sunday..6=Sat)
// for the future "no non-veg on Tuesdays" use case.
export type Dislike = {
  name: string
  slot?: 'BREAKFAST' | 'LUNCH' | 'DINNER' | null
  dayOfWeek?: number | null
}

export type Household = {
  id: string
  owner_id: string
  name: string
  region: string | null
  members: number
  vegetarian: boolean
  voting_enabled: boolean
  onboarding_complete: boolean
  join_code: string | null
  dislikes: Dislike[]  // JSONB column, always present (default '[]')
  suggestion_count: number  // 1-12, from Migration 0010
  dishes_per_meal: number    // 1-6, from Migration 0010
}

export type Voter = { id: string; name: string; invite_code: string }
export type VoteRow = { voter_id: string; meal_id: string; poll_date: string }
export type MealHistoryRow = { meal_id: string; dishes: Dish[]; confirmed_at: string }

const table = (name: string) => supabase.from(name)

export const fetchHousehold = async (ownerId: string): Promise<Household | null> => {
  const { data, error } = await table('households').select('*').eq('owner_id', ownerId).maybeSingle()
  if (error) throw error
  return data as Household | null
}

export const createHousehold = async (ownerId: string, defaults: Partial<Household> = {}): Promise<Household> => {
  const row = { owner_id: ownerId, name: defaults.name ?? 'My Kitchen', region: defaults.region ?? null, members: defaults.members ?? 4, vegetarian: defaults.vegetarian ?? false, voting_enabled: defaults.voting_enabled ?? false, onboarding_complete: defaults.onboarding_complete ?? false }
  const { data, error } = await table('households').insert(row).select('*').single()
  if (error) throw error
  return data as Household
}

export const updateHousehold = async (id: string, patch: Partial<Household>): Promise<Household> => {
  const { data, error } = await table('households').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as Household
}

export const seedInventory = async (householdId: string, items: InventoryItem[] = DEFAULT_INVENTORY) => {
  const rows = items.map((i) => ({ household_id: householdId, name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, reorder_at: i.reorderAt, target_stock: i.targetStock }))
  const { error } = await table('inventory_items').insert(rows)
  if (error) throw error
}

export const fetchInventory = async (householdId: string): Promise<InventoryItem[]> => {
  const { data, error } = await table('inventory_items').select('id, name, quantity, unit, category, reorder_at, target_stock').eq('household_id', householdId).order('name')
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, quantity: Number(r.quantity), unit: r.unit, category: r.category as 'weekly' | 'monthly', reorderAt: Number(r.reorder_at), targetStock: Number(r.target_stock) }))
}

export const updateInventoryItem = async (id: string, quantity: number) => {
  const { error } = await table('inventory_items').update({ quantity }).eq('id', id)
  if (error) throw error
}

export const fetchVoters = async (householdId: string): Promise<Voter[]> => {
  const { data, error } = await table('voters').select('id, name, invite_code').eq('household_id', householdId).order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, invite_code: r.invite_code }))
}

export const addVoterRow = async (householdId: string, name: string, inviteCode: string): Promise<Voter> => {
  const { data, error } = await table('voters').insert({ household_id: householdId, name, invite_code: inviteCode }).select('id, name, invite_code').single()
  if (error) throw error
  return data as Voter
}

export const removeVoterRow = async (id: string) => {
  const { error } = await table('voters').delete().eq('id', id)
  if (error) throw error
}

export const fetchVotesToday = async (householdId: string): Promise<VoteRow[]> => {
  // Read using the same Asia/Kolkata day key that upsertVote writes with.
  // Was `new Date().toISOString().slice(0, 10)` — UTC, so after 8:30pm IST
  // the read key was "tomorrow" and empty results silently dropped the vote.
  const today = istDateKey(new Date())
  const { data, error } = await table('votes').select('voter_id, meal_id, poll_date').eq('household_id', householdId).eq('poll_date', today)
  if (error) throw error
  return (data ?? []) as VoteRow[]
}

export const upsertVote = async (householdId: string, voterId: string, mealId: string) => {
  const today = istDateKey(new Date())
  const { error } = await table('votes').upsert({ household_id: householdId, voter_id: voterId, meal_id: mealId, poll_date: today }, { onConflict: 'voter_id,poll_date' })
  if (error) throw error
}

export const recordMeal = async (householdId: string, mealId: string, dishes: Dish[]) => {
  const { error } = await table('meal_history').insert({ household_id: householdId, meal_id: mealId, dishes })
  if (error) throw error
}

// Phase F: confirm path for user-picked dishes. The legacy recordMeal takes
// Dish[] (so the engine's confirmMeal can derive ingredients); manual picks
// only carry name + an optional source id. Persist with a clear shape so the
// family tab / history section can render them without a Dish round-trip.
export const recordManualMeal = async (
  householdId: string,
  syntheticMealId: string,
  picks: { dish_id: string | null; name: string; source: string }[],
) => {
  const { error } = await table('meal_history').insert({
    household_id: householdId,
    meal_id: syntheticMealId,
    dishes: picks.map((p) => ({ id: p.dish_id, name: p.name, source: p.source })),
  })
  if (error) throw error
}

export const fetchMealHistory = async (householdId: string, limit = 7): Promise<MealHistoryRow[]> => {
  const { data, error } = await table('meal_history')
    .select('meal_id, dishes, confirmed_at')
    .eq('household_id', householdId)
    .order('confirmed_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as MealHistoryRow[]
}

// Public lookup by join code. The RLS policy "join code lookup" on
// households allows SELECT when join_code is not null, so this works for
// any authenticated user (including joiners who aren't the owner). We
// return the bare minimum the join screen needs: id and name. We never
// expose owner_id, region, or other private fields.
export const fetchHouseholdByJoinCode = async (code: string): Promise<{ id: string; name: string } | null> => {
  const { data, error } = await table('households')
    .select('id, name')
    .eq('join_code', code)
    .maybeSingle()
  if (error) throw error
  return data as { id: string; name: string } | null
}

// Persist a freshly generated join code on the household. Idempotent —
// callers should generate once and only set if null. The RLS "join code
// lookup" policy permits this for the owner (any authenticated user
// with is_household_owner = true).
export const setHouseholdJoinCode = async (householdId: string, code: string) => {
  const { error } = await table('households').update({ join_code: code }).eq('id', householdId)
  if (error) throw error
}

// Generates and persists a join code, retrying on the (rare) chance of
// collision. Returns the updated household. Bails after 5 attempts.
export const generateAndSetJoinCode = async (hh: Household): Promise<Household> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateJoinCode()
    try {
      await setHouseholdJoinCode(hh.id, code)
      return { ...hh, join_code: code }
    } catch (e: any) {
      // Supabase unique-violation code is '23505'. Retry on collision;
      // surface any other error immediately.
      if (e?.code !== '23505' && !String(e?.message || '').includes('duplicate')) throw e
    }
  }
  throw new Error('Could not generate a unique join code after 5 attempts')
}

// ============================================================================
// Features v1 — meal plans, custom inventory, order overrides, voter prefs
// ============================================================================

export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER'

// Source of a dish in a meal_plans.manual_dishes entry. Drives how the
// picker renders the row (icon, link to source record, delete semantics).
export type ManualDishSource = 'user_meal' | 'household_meal' | 'curated' | 'adhoc'

export type ManualDish = {
  dish_id: string | null  // null only for source='adhoc'
  name: string
  source: ManualDishSource
}

export type MealPlan = {
  id: string
  household_id: string
  plan_date: string  // ISO date 'YYYY-MM-DD'
  slot: MealSlot
  meal_id: string | null
  excluded_dishes: string[]  // dish names the user toggled off in the editor
  manual_dishes: ManualDish[]  // user-picked dishes for this slot (Phase F)
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

export const fetchMealPlansForDay = async (householdId: string, isoDate: string): Promise<MealPlan[]> => {
  const { data, error } = await table('meal_plans')
    .select('*')
    .eq('household_id', householdId)
    .eq('plan_date', isoDate)
  if (error) throw error
  return (data ?? []) as MealPlan[]
}

export const upsertMealPlan = async (
  householdId: string,
  isoDate: string,
  slot: MealSlot,
  mealId: string | null,
  excludedDishes: string[] = [],
  manualDishes: ManualDish[] = [],
) => {
  const { data, error } = await table('meal_plans')
    .upsert({
      household_id: householdId,
      plan_date: isoDate,
      slot,
      meal_id: mealId,
      excluded_dishes: excludedDishes,
      manual_dishes: manualDishes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id,plan_date,slot' })
    .select('*')
  if (error) throw error
  return data?.[0] as MealPlan
}

// Phase F: replace just the manual_dishes array on a slot's plan row.
// Used by the Today slot picker — much smaller payload than upsertMealPlan
// and avoids accidentally clobbering meal_id / excluded_dishes.
export const setMealPlanManualDishes = async (
  householdId: string,
  isoDate: string,
  slot: MealSlot,
  manualDishes: ManualDish[],
): Promise<MealPlan> => {
  // Use upsert with onConflict so this works even when the slot has no
  // existing plan row yet (e.g., fresh day, nothing planned).
  const { data, error } = await table('meal_plans')
    .upsert({
      household_id: householdId,
      plan_date: isoDate,
      slot,
      meal_id: null,  // user is manually picking — drop any engine-set meal_id
      manual_dishes: manualDishes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id,plan_date,slot' })
    .select('*')
    .single()
  if (error) throw error
  return data as MealPlan
}

export const confirmMealPlan = async (householdId: string, isoDate: string, slot: MealSlot) => {
  const { error } = await table('meal_plans')
    .update({ confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('household_id', householdId)
    .eq('plan_date', isoDate)
    .eq('slot', slot)
  if (error) throw error
}

// Custom inventory items are user-added entries that don't match the seed
// ingredient IDs. They're deletable, editable like any other inventory row,
// and carry custom=true so the UI can render a delete button on them.
export const addCustomInventoryItem = async (householdId: string, item: { name: string; quantity: number; unit: string; category: 'weekly' | 'monthly'; reorderAt?: number; targetStock?: number; group?: string }): Promise<{ id: string }> => {
  const row = { household_id: householdId, name: item.name, quantity: item.quantity, unit: item.unit, category: item.category, reorder_at: item.reorderAt ?? Math.max(1, Math.floor(item.quantity * 0.5)), target_stock: item.targetStock ?? item.quantity, custom: true, group: item.group ?? null }
  const { data, error } = await table('inventory_items').insert(row).select('id').single()
  if (error) throw error
  return data as { id: string }
}

export const deleteInventoryItem = async (id: string) => {
  const { error } = await table('inventory_items').delete().eq('id', id)
  if (error) throw error
}

// Bulk-replace a household's inventory with the given items. Used by the
// onboarding wizard — the user picks the items they want, and we wipe any
// existing rows and insert the chosen set in one go. The kitchen
// template's inventory ids are stable strings ("atta", "rice", "toor-dal"
// etc.) so re-running onboarding is idempotent at the row level.
//
// If items is empty, deletes everything (so the user can onboard with an
// empty kitchen and add things manually from the Kitchen tab).
export const bulkReplaceInventory = async (householdId: string, items: { id: string; name: string; quantity: number; unit: string; category: 'weekly' | 'monthly'; group?: string }[]): Promise<void> => {
  // Step 1: clear existing rows for this household.
  const { error: delErr } = await table('inventory_items').delete().eq('household_id', householdId)
  if (delErr) throw delErr
  if (items.length === 0) return
  // Step 2: insert the new set.
  const rows = items.map((it) => ({
    household_id: householdId,
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    category: it.category,
    reorder_at: Math.max(1, Math.floor(it.quantity * 0.4)),
    target_stock: it.quantity,
    custom: false,  // template items are not user-custom, just seeded from the template
    group: it.group ?? null,
  }))
  const { error: insErr } = await table('inventory_items').insert(rows)
  if (insErr) throw insErr
}

export type OrderOverride = {
  id: string
  household_id: string
  slot: 'weekly' | 'monthly'
  inventory_id: string | null
  custom_name: string | null
  custom_quantity: number | null
  custom_unit: string | null
  custom_category: 'weekly' | 'monthly' | null
  action: 'add' | 'remove'
  created_at: string
}

export const fetchOrderOverrides = async (householdId: string): Promise<OrderOverride[]> => {
  const { data, error } = await table('order_overrides').select('*').eq('household_id', householdId)
  if (error) throw error
  return (data ?? []) as OrderOverride[]
}

export const addOrderOverride = async (o: Omit<OrderOverride, 'id' | 'created_at'>) => {
  const { error } = await table('order_overrides').insert(o)
  if (error) throw error
}

export const deleteOrderOverride = async (id: string) => {
  const { error } = await table('order_overrides').delete().eq('id', id)
  if (error) throw error
}

export type VoterMealPreference = {
  id: string
  voter_id: string
  slot: MealSlot | null
  day_of_week: number | null
  meal_name: string | null
  mood: string | null
  strength: number
  created_at: string
}

export const fetchVoterPreferences = async (voterId: string): Promise<VoterMealPreference[]> => {
  const { data, error } = await table('voter_meal_preferences').select('*').eq('voter_id', voterId)
  if (error) throw error
  return (data ?? []) as VoterMealPreference[]
}

export const fetchHouseholdPreferences = async (householdId: string): Promise<VoterMealPreference[]> => {
  // Get all voters in the household, then union their preferences.
  const voters = await fetchVoters(householdId)
  const voterIds = voters.map((v) => v.id)
  if (voterIds.length === 0) return []
  const { data, error } = await table('voter_meal_preferences').select('*').in('voter_id', voterIds)
  if (error) throw error
  return (data ?? []) as VoterMealPreference[]
}

export const addVoterPreference = async (pref: Omit<VoterMealPreference, 'id' | 'created_at'>): Promise<VoterMealPreference> => {
  const { data, error } = await table('voter_meal_preferences').insert(pref).select('*').single()
  if (error) throw error
  return data as VoterMealPreference
}

export const deleteVoterPreference = async (id: string) => {
  const { error } = await table('voter_meal_preferences').delete().eq('id', id)
  if (error) throw error
}

// ============================================================================
// User-authored meals — household-scoped recipes the user builds themselves.
// ============================================================================

// Mirrors the mealEngine.Dish shape so a user meal can flow through the
// existing rendering pipeline (recommendMeals → MealOption → UI). One
// user_meal row = one Dish entry. To bundle multiple dishes into one
// recommended meal, we group by a shared `meal_title` on the client.
export type UserMeal = {
  id: string
  household_id: string
  name: string                  // dish name ("Rajma")
  description: string           // short subtitle
  time: number                  // cook minutes
  vegetarian: boolean
  kind: 'main' | 'side' | 'bread' | 'rice'
  color: string | null
  ingredients: { ingredientId: string; quantity: number }[]
  sort_order: number
  created_at: string
  updated_at: string
}

export const fetchUserMeals = async (householdId: string): Promise<UserMeal[]> => {
  const { data, error } = await table('user_meals')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as UserMeal[]
}

export const addUserMeal = async (householdId: string, meal: Omit<UserMeal, 'id' | 'household_id' | 'created_at' | 'updated_at'>): Promise<UserMeal> => {
  const row = { household_id: householdId, ...meal }
  const { data, error } = await table('user_meals').insert(row).select('*').single()
  if (error) throw error
  return data as UserMeal
}

export const updateUserMeal = async (id: string, patch: Partial<Omit<UserMeal, 'id' | 'household_id' | 'created_at'>>): Promise<UserMeal> => {
  const { data, error } = await table('user_meals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as UserMeal
}

export const deleteUserMeal = async (id: string) => {
  const { error } = await table('user_meals').delete().eq('id', id)
  if (error) throw error
}

// ============================================================================
// Phase E: composed meals (multiple dishes in one recommended meal).
// One row in `household_meals` = one composed meal. Each composed meal
// has 1..n dishes. The client renders the meals alongside the curated
// and single-dish user_meals in the Today tab.
// ============================================================================

export type HouseholdMeal = {
  id: string
  household_id: string
  name: string                  // meal title (e.g. "Cucumber + Salad + Anda Bhurji + Roti")
  description: string           // subtitle
  slot: 'BREAKFAST' | 'LUNCH' | 'DINNER' | null
  dishes: { id: string; name: string }[]   // 1..n dishes, by seed id (or custom UUID)
  match_count: number           // 0..100, set by the App before save
  created_at: string
  updated_at: string
}

export const fetchHouseholdMeals = async (householdId: string): Promise<HouseholdMeal[]> => {
  const { data, error } = await table('household_meals')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HouseholdMeal[]
}

export const addHouseholdMeal = async (householdId: string, meal: Omit<HouseholdMeal, 'id' | 'household_id' | 'created_at' | 'updated_at'>): Promise<HouseholdMeal> => {
  const row = { household_id: householdId, ...meal }
  const { data, error } = await table('household_meals').insert(row).select('*').single()
  if (error) throw error
  return data as HouseholdMeal
}

export const updateHouseholdMeal = async (id: string, patch: Partial<Omit<HouseholdMeal, 'id' | 'household_id' | 'created_at'>>): Promise<HouseholdMeal> => {
  const { data, error } = await table('household_meals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as HouseholdMeal
}

export const deleteHouseholdMeal = async (id: string) => {
  const { error } = await table('household_meals').delete().eq('id', id)
  if (error) throw error
}

// ============================================================================
// Reset household data — atomic wipe of operational rows, household kept
// ============================================================================

// Calls the reset_household_data(uuid) Postgres function. Returns the
// function's error if the caller isn't the household owner (RPC throws
// 42501 — surfaced via the .rpc() promise). The household row itself
// is preserved, so the user stays signed in and can re-onboard.
export const resetHouseholdData = async (householdId: string): Promise<void> => {
  const { error } = await supabase.rpc('reset_household_data', { p_household_id: householdId })
  if (error) throw error
}

// ============================================================================
// Per-household overrides for curated DISHES (hide / edit)
// ============================================================================

// One row per (household_id, dish_id). `hidden` filters the dish out of
// the household's pool; `override` replaces the curated fields when set.
// Both can coexist (hidden takes priority; override fields are ignored
// while hidden — we don't surface hidden dishes for editing).
export type DishOverrideRow = {
  id: string
  household_id: string
  dish_id: string
  hidden: boolean
  override: Dish | null
  created_at: string
  updated_at: string
}

export const fetchDishOverrides = async (householdId: string): Promise<DishOverrideRow[]> => {
  const { data, error } = await table('household_dish_overrides')
    .select('*')
    .eq('household_id', householdId)
  if (error) throw error
  return (data ?? []) as DishOverrideRow[]
}

// Upsert a hide-or-edit override for one curated dish. Pass both
// `hidden` and `override` fields — the row is keyed by
// (household_id, dish_id), so subsequent calls just update it.
export const upsertDishOverride = async (
  householdId: string,
  dishId: string,
  patch: { hidden?: boolean; override?: Dish | null },
): Promise<DishOverrideRow> => {
  const row = {
    household_id: householdId,
    dish_id: dishId,
    hidden: patch.hidden ?? false,
    override: patch.override ?? null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await table('household_dish_overrides')
    .upsert(row, { onConflict: 'household_id,dish_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as DishOverrideRow
}

export const deleteDishOverride = async (householdId: string, dishId: string) => {
  const { error } = await table('household_dish_overrides')
    .delete()
    .eq('household_id', householdId)
    .eq('dish_id', dishId)
  if (error) throw error
}

// ============================================================================
// Phase H: meal_polls — per-day, per-slot candidate bundles for voting.
//
// The owner pre-bundles N options (2..6), sends the join URL to voters, and
// voters each pick one option. The winning option's dishes get adopted as
// the slot's manual_dishes when the owner finalises.
// ============================================================================

export type PollOption = {
  id: string
  title: string
  dishes: ManualDish[]
}

export type MealPoll = {
  id: string
  household_id: string
  plan_date: string
  slot: MealSlot
  options: PollOption[]
  closed_at: string | null
  created_at: string
  updated_at: string
}

export const upsertPoll = async (
  householdId: string,
  isoDate: string,
  slot: MealSlot,
  options: PollOption[],
): Promise<MealPoll> => {
  const { data, error } = await table('meal_polls')
    .upsert({
      household_id: householdId,
      plan_date: isoDate,
      slot,
      options,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id,plan_date,slot' })
    .select('*')
    .single()
  if (error) throw error
  return data as MealPoll
}

export const fetchPollsForDay = async (householdId: string, isoDate: string): Promise<MealPoll[]> => {
  const { data, error } = await table('meal_polls')
    .select('*')
    .eq('household_id', householdId)
    .eq('plan_date', isoDate)
  if (error) throw error
  return (data ?? []) as MealPoll[]
}

export const fetchPollById = async (pollId: string): Promise<MealPoll | null> => {
  const { data, error } = await table('meal_polls').select('*').eq('id', pollId).maybeSingle()
  if (error) throw error
  return data as MealPoll | null
}

export const closePoll = async (pollId: string) => {
  const { error } = await table('meal_polls')
    .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', pollId)
  if (error) throw error
}

// Hard-delete a poll + its votes (owner-only). Used when the owner hits
// "Delete poll" — they don't want the artefact lingering, and any votes
// cast against it should disappear too. Vote rows are FK-linked without
// ON DELETE CASCADE (v0 schema), so we delete votes explicitly first.
export const deletePoll = async (pollId: string) => {
  // Best-effort: try to delete votes first. If the votes table isn't
  // accessible to the anon role (RLS), this errors silently — but the
  // meal_polls DELETE will still succeed and the orphan votes become
  // harmless dead rows.
  try { await table('votes').delete().eq('poll_id', pollId) } catch { /* ignore */ }
  const { error } = await table('meal_polls').delete().eq('id', pollId)
  if (error) throw error
}

// Cast a vote for a specific poll option. Returns the upserted row.
// voters.cast vote via their auth'd voter id (selected from localStorage
// or by re-entering their name on this device).
export const upsertPollVote = async (
  householdId: string,
  voterId: string,
  pollId: string,
  optionId: string,
) => {
  // votes.meal_id encodes `<poll_id>:opt:<option_id>` so the votes table
  // doesn't need a separate poll_options table. Cast as one vote per
  // (voter_id, poll_date) so a voter can change their pick.
  // poll_date uses the IST day key (not UTC) so the write lands on the
  // same day the user is looking at — anon_fetch_today_tally reads it
  // back with the same key.
  const pollDate = istDateKey(new Date())
  const mealId = `poll-${pollId}:opt:${optionId}`
  const { error } = await table('votes').upsert(
    { household_id: householdId, voter_id: voterId, meal_id: mealId, poll_date: pollDate },
    { onConflict: 'voter_id,poll_date' },
  )
  if (error) throw error
}

// Returns the {voterId → optionId} map for a given poll. Voters use this
// to render who voted for what on the ballot. Owners use this to render
// the running tally on the Today slot card.
export const fetchPollTally = async (pollId: string): Promise<Record<string, string>> => {
  // Tally is derived from the votes table. We rely on the format above
  // and the fact that the votes.meal_id for this household + today's date
  // covers all open polls simultaneously — same meal_id encoding across
  // polls would collide. We narrow by joining on the meal_id LIKE pattern.
  // supabase-js doesn't expose LIKE directly via .eq() so we use .like().
  // Use the IST day key so this read matches the upsertPollVote write —
  // otherwise the tally is empty after 8:30pm IST on the owner's device.
  const today = istDateKey(new Date())
  const { data, error } = await table('votes')
    .select('voter_id, meal_id, poll_date')
    .like('meal_id', `poll-${pollId}:opt:%`)
    .eq('poll_date', today)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    const m = /^poll-[^:]+:opt:(.+)$/.exec(row.meal_id)
    if (m) out[row.voter_id] = m[1]
  }
  return out
}

// Find a voter by name in a household. Used by the VoterDashboard to look
// up the voter's id once they re-enter their name on a new device. We
// don't auth the joiner via Supabase auth — we trust the household's
// owner + the voter's name pairing because the join flow already created
// the voter row.
export const findVoterByName = async (householdId: string, name: string): Promise<{ id: string; name: string; invite_code: string } | null> => {
  const { data, error } = await table('voters')
    .select('id, name, invite_code')
    .eq('household_id', householdId)
    .ilike('name', name.trim())
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Anon-safe RPC wrappers (migration 0017).
//
// These replace direct SELECTs on voters / meal_polls from any future anon
// voter landing flow. Each one takes a join_code and resolves to a single
// household inside SECURITY DEFINER; anon callers can never enumerate other
// households because the join_code is the gate and we don't expose anything
// but the targeted slice.
//
// Today's join flow has voters sign in with Google before accessing the app,
// so these RPCs aren't called yet — but they're here for the next iteration
// (true anon voter view, no Google required) and as defence in depth in case
// the 0017 SQL is applied before any consumer code lands.
// ---------------------------------------------------------------------------

export type AnonVoter = { id: string; name: string; invite_code: string }

// Returns the voter roster for the household whose join_code matches.
// Empty array if the code is unknown (don't distinguish "no such code"
// from "empty roster" — no enumeration oracle).
export const fetchVoterRosterByJoinCodeAnon = async (joinCode: string): Promise<AnonVoter[]> => {
  const { data, error } = await supabase.rpc('anon_lookup_voters_by_join_code', { p_code: joinCode })
  if (error) throw error
  return (data ?? []) as AnonVoter[]
}

// Returns the open poll for the household tied to joinCode on isoDate
// (YYYY-MM-DD), or null if none open / code invalid.
export const fetchTodayPollAnon = async (joinCode: string, isoDate: string): Promise<MealPoll | null> => {
  const { data, error } = await supabase.rpc('anon_fetch_today_poll', { p_code: joinCode, p_date: isoDate })
  if (error) throw error
  const rows = (data ?? []) as MealPoll[]
  return rows[0] ?? null
}

// Returns {voter_id → option_id} for the household's open poll on isoDate.
// Empty object if the code is invalid or no open poll exists.
export const fetchTodayTallyAnon = async (joinCode: string, isoDate: string): Promise<Record<string, string>> => {
  const { data, error } = await supabase.rpc('anon_fetch_today_tally', { p_code: joinCode, p_date: isoDate })
  if (error) throw error
  const out: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{ voter_id: string; option_id: string }>) {
    out[row.voter_id] = row.option_id
  }
  return out
}

// Cast a vote as an anonymous user (no Google sign-in). Takes the
// voter's display name (case-insensitive exact match against the
// household's voters.name) and the option they're picking. The RPC
// handles voter lookup + closed-poll check + option validation in
// SECURITY DEFINER, so this client never touches the voters or votes
// tables directly. Returns the {voter_id, option_id} the server
// recorded — caller can use this to refresh its local tally.
//
// Throws on:
//   * unknown join_code   (Postgres exception 'unknown join_code')
//   * unknown voter name  (Postgres exception 'unknown voter name')
//   * poll already closed (Postgres exception 'poll is closed')
//   * invalid option_id   (Postgres exception 'invalid option')
//
// The RPC returns the exception text in `error.message` for these —
// the caller (VoterLanding) maps them to user-friendly copy.
export const castVoteAnon = async (
  joinCode: string,
  voterName: string,
  pollId: string,
  optionId: string,
): Promise<{ voter_id: string; option_id: string }> => {
  const { data, error } = await supabase.rpc('anon_cast_vote_by_name', {
    p_code: joinCode,
    p_voter_name: voterName,
    p_poll_id: pollId,
    p_option_id: optionId,
  })
  if (error) throw error
  const row = (data ?? []) as Array<{ voter_id: string; option_id: string }>
  if (row.length === 0) throw new Error('vote_not_recorded')
  return row[0]
}

// Token-bound vote cast. Use this when the share URL includes a
// per-voter token (?join=<code>&voter=<invite_code>) so the recipient
// is already identified and the name picker can be skipped. The RPC
// (anon_cast_vote_by_token, migration 0018) resolves the voter from
// the token inside SECURITY DEFINER — same idea as castVoteAnon but
// the voter lookup is by token, not by name.
export const castVoteAnonByToken = async (
  joinCode: string,
  voterToken: string,
  pollId: string,
  optionId: string,
): Promise<{ voter_id: string; option_id: string }> => {
  const { data, error } = await supabase.rpc('anon_cast_vote_by_token', {
    p_code: joinCode,
    p_voter_token: voterToken,
    p_poll_id: pollId,
    p_option_id: optionId,
  })

  if (error) throw error
  const row = (data ?? []) as Array<{ voter_id: string; option_id: string }>
  if (row.length === 0) throw new Error('vote_not_recorded')
  return row[0]
}

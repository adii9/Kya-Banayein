import type { InventoryItem, Dish } from './mealEngine'
import { DEFAULT_INVENTORY } from './mealEngine'
import { supabase } from './supabase'

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
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await table('votes').select('voter_id, meal_id, poll_date').eq('household_id', householdId).eq('poll_date', today)
  if (error) throw error
  return (data ?? []) as VoteRow[]
}

export const upsertVote = async (householdId: string, voterId: string, mealId: string) => {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await table('votes').upsert({ household_id: householdId, voter_id: voterId, meal_id: mealId, poll_date: today }, { onConflict: 'voter_id,poll_date' })
  if (error) throw error
}

export const recordMeal = async (householdId: string, mealId: string, dishes: Dish[]) => {
  const { error } = await table('meal_history').insert({ household_id: householdId, meal_id: mealId, dishes })
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

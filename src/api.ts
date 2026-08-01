import type { InventoryItem, Dish } from './mealEngine'
import { DEFAULT_INVENTORY } from './mealEngine'
import { supabase } from './supabase'

export type Household = {
  id: string
  owner_id: string
  name: string
  region: string | null
  members: number
  vegetarian: boolean
  voting_enabled: boolean
  onboarding_complete: boolean
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

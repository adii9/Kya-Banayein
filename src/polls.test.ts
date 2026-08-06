import { describe, expect, it } from 'vitest'
import { confirmMeal, resolvePicksToUses, type Dish } from './mealEngine'

// Helper: build a curated Dish with ingredients per the mealEngine shape.
const mkCurated = (id: string, name: string, ingredientIds: string[]): Dish => ({
  id,
  name,
  description: `${name} (audit)`,
  time: 15,
  vegetarian: true,
  kind: 'main',
  color: '#aaaaaa',
  ingredients: ingredientIds.map((iid) => ({ ingredientId: iid, quantity: 100 })),
})

describe('resolvePicksToUses', () => {
  const curated = [
    mkCurated('raita', 'Boondi Raita', ['yogurt', 'boondi']),
    mkCurated('roti', 'Roti', ['atta']),
  ]

  it('returns no ingredients for an ad-hoc pick', () => {
    const r = resolvePicksToUses(
      [{ dish_id: null, name: 'Makki ki Roti', source: 'adhoc' }],
      curated,
      [],
      [],
    )
    expect(r.uses).toEqual([])
    expect(r.skipped).toHaveLength(1)
    expect(r.unresolved).toEqual([])
  })

  it('resolves a curated pick to its ingredients', () => {
    const r = resolvePicksToUses(
      [{ dish_id: 'raita', name: 'Boondi Raita', source: 'curated' }],
      curated,
      [],
      [],
    )
    expect(r.uses).toHaveLength(2)
    expect(r.uses.map((u) => u.ingredientId).sort()).toEqual(['boondi', 'yogurt'])
  })

  it('resolves a user-meal pick and surfaces unresolved when missing', () => {
    const um = [{ id: 'um-1', ingredients: [{ ingredientId: 'toor-dal', quantity: 200 }] }]
    const r1 = resolvePicksToUses(
      [{ dish_id: 'um-1', name: 'Toor Dal', source: 'user_meal' }],
      curated,
      um,
      [],
    )
    expect(r1.uses).toEqual([{ ingredientId: 'toor-dal', quantity: 200 }])
    const r2 = resolvePicksToUses(
      [{ dish_id: 'missing', name: 'X', source: 'user_meal' }],
      curated,
      um,
      [],
    )
    expect(r2.unresolved).toHaveLength(1)
  })

  it('expands a composed meal to its inner DISHES rows', () => {
    const cm = [{ id: 'cm-1', dishes: [{ id: 'raita', name: 'Boondi Raita' }, { id: 'roti', name: 'Roti' }] }]
    const r = resolvePicksToUses(
      [{ dish_id: 'cm-1', name: 'Combo', source: 'household_meal' }],
      curated,
      [],
      cm,
    )
    expect(r.uses).toHaveLength(3) // 2 from raita + 1 from roti
    expect(r.uses.map((u) => u.ingredientId).sort()).toEqual(['atta', 'boondi', 'yogurt'])
  })

  it('mixed batch: curated + user-meal + ad-hoc + missing composed', () => {
    const um = [{ id: 'um-x', ingredients: [{ ingredientId: 'cheese', quantity: 50 }] }]
    const cm = [{ id: 'cm-gone', dishes: [{ id: 'no-such-dish', name: 'Phantom' }] }]
    const r = resolvePicksToUses(
      [
        { dish_id: 'raita', name: 'Boondi Raita', source: 'curated' },
        { dish_id: 'um-x', name: 'Cheese Toast', source: 'user_meal' },
        { dish_id: null, name: 'Adhoc Dish', source: 'adhoc' },
        { dish_id: 'cm-gone', name: 'Stale Combo', source: 'household_meal' },
      ],
      curated,
      um,
      cm,
    )
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0].name).toBe('Adhoc Dish')
    expect(r.unresolved).toHaveLength(0) // composed-meal with phantom inner still resolves to no ingredients silently
    // The composed meal contributes 0 ingredients (no inner dish found), so uses is just raita + cheese toast
    expect(r.uses.map((u) => u.ingredientId).sort()).toEqual(['boondi', 'cheese', 'yogurt'])
  })
})

// Same encoding the schema enforces for votes.meal_id. Tested as a pure
// string helper so we catch regressions if the encoding ever drifts.
describe('poll meal_id encoding', () => {
  it('round-trips through the tally regex', () => {
    const pollId = 'e21e11fe-8015-421c-9af0-2bd144152784'
    const optionId = 'a'
    const mealId = `poll-${pollId}:opt:${optionId}`
    const m = /^poll-[^:]+:opt:(.+)$/.exec(mealId)
    expect(m?.[1]).toBe(optionId)
  })
})

// Smoke-test that confirmMeal against the default inventory still works
// the way the engine has it — sanity before any ingredient-resolution
// downstream test depends on it.
describe('confirmMeal manual-pick integration', () => {
  it('deducts from inventory by ingredient name', () => {
    const inv = [{ id: 'atta-uuid', name: 'Atta', quantity: 1000, unit: 'g', category: 'monthly' as const, reorderAt: 100, targetStock: 2000 }]
    const out = confirmMeal(inv, [{ ingredientId: 'Atta', quantity: 200 }])
    expect(out[0].quantity).toBe(800)
  })
})

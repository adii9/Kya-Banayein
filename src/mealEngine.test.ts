import { describe, expect, it } from 'vitest'
import { applyDishOverrides, buildDishOverrideMap, confirmMeal, DISHES, getOrderSuggestions, mealTitleFromDishes, recommendMeals, type InventoryItem, type UserDish } from './mealEngine'

describe('recommendMeals', () => {
  it('returns the user-selected number of meal options with the selected number of dishes', () => {
    const meals = recommendMeals({ suggestionCount: 3, dishesPerMeal: 2, vegetarian: true }, [])

    expect(meals).toHaveLength(3)
    expect(meals.every((meal) => meal.dishes.length === 2)).toBe(true)
    expect(meals.flatMap((meal) => meal.dishes).every((dish) => dish.vegetarian)).toBe(true)
  })

  it('filters user meals by household vegetarian preference', () => {
    const eggMeal: UserDish = { id: 'user-egg', name: 'Egg Bhurji', description: '', time: 15, vegetarian: false, kind: 'main', color: '#dca531', ingredients: [] }
    const paneerMeal: UserDish = { id: 'user-paneer', name: 'Paneer Tikka', description: '', time: 25, vegetarian: true, kind: 'main', color: '#cf7642', ingredients: [] }

    const veg = recommendMeals({ suggestionCount: 5, dishesPerMeal: 3, vegetarian: true }, [], [eggMeal, paneerMeal])
    const nonVeg = recommendMeals({ suggestionCount: 5, dishesPerMeal: 3, vegetarian: false }, [], [eggMeal, paneerMeal])

    expect(veg.flatMap((m) => m.dishes).some((d) => d.id === 'user-egg')).toBe(false)
    expect(veg.flatMap((m) => m.dishes).some((d) => d.id === 'user-paneer')).toBe(true)
    expect(nonVeg.flatMap((m) => m.dishes).some((d) => d.id === 'user-egg')).toBe(true)
  })

  it('derives meal titles from actual dishes instead of cycling generic labels', () => {
    const meals = recommendMeals({ suggestionCount: 2, dishesPerMeal: 1, vegetarian: true }, [])
    // Single-dish meals take the dish name directly.
    expect(meals[0].title).not.toBe('Ghar ka favourite')
    expect(meals[0].title.length).toBeGreaterThan(0)
  })

  it('excludes curated dishes that the household has hidden', () => {
    const overrides = buildDishOverrideMap([
      { dish_id: 'chicken-curry', hidden: true, override: null },
    ])
    const meals = recommendMeals({ suggestionCount: 5, dishesPerMeal: 5, vegetarian: false }, [], [], overrides)
    expect(meals.flatMap((m) => m.dishes).some((d) => d.id === 'chicken-curry')).toBe(false)
    // Sanity: other curated dishes still surface.
    expect(meals.flatMap((m) => m.dishes).some((d) => d.id === 'egg-bhurji')).toBe(true)
  })

  it('gives genuinely different suggestions for breakfast vs dinner', () => {
    // The bug report: tapping Breakfast / Lunch / Dinner yielded the
    // same dish combinations. With slot-tagged DISHES, breakfast
    // should pull Poha/Upma/Idli/Besan Chilla etc., never Chicken.
    const breakfast = recommendMeals({ suggestionCount: 6, dishesPerMeal: 3, vegetarian: false }, [], [], {}, 'BREAKFAST')
    const dinner = recommendMeals({ suggestionCount: 6, dishesPerMeal: 3, vegetarian: false }, [], [], {}, 'DINNER')
    const breakfastIds = new Set(breakfast.flatMap((m) => m.dishes).map((d) => d.id))
    const dinnerIds = new Set(dinner.flatMap((m) => m.dishes).map((d) => d.id))
    // Chicken-curry is lunch/dinner only — must NOT appear in breakfast
    expect(breakfastIds.has('chicken-curry')).toBe(false)
    // Poha is breakfast/snacks only — must NOT appear in dinner
    expect(dinnerIds.has('poha')).toBe(false)
    // And the two pools should overlap on shared items (roti, paratha)
    // but each have items the other doesn't.
    expect(breakfastIds.has('paratha')).toBe(true)
    expect(dinnerIds.has('paratha')).toBe(true)
    // At least one breakfast-only item
    expect(breakfastIds.has('poha') || breakfastIds.has('upma') || breakfastIds.has('idli')).toBe(true)
    // At least one dinner-only item
    expect(dinnerIds.has('rajma') || dinnerIds.has('chicken-curry') || dinnerIds.has('paneer')).toBe(true)
  })

  it('meal IDs are slot-prefixed so votes and plans don\'t collide across slots', () => {
    const breakfast = recommendMeals({ suggestionCount: 3, dishesPerMeal: 2, vegetarian: true }, [], [], {}, 'BREAKFAST')
    const dinner = recommendMeals({ suggestionCount: 3, dishesPerMeal: 2, vegetarian: true }, [], [], {}, 'DINNER')
    expect(breakfast[0].id).toMatch(/^BREAKFAST-meal-/)
    expect(dinner[0].id).toMatch(/^DINNER-meal-/)
    expect(breakfast[0].id).not.toBe(dinner[0].id)
  })

  it('falls back to the full pool when no slot-tagged dish matches (empty kitchen edge case)', () => {
    // Empty kitchen + breakfast → no dish has stock, but the engine
    // still returns a result so the screen isn't blank. The first
    // suggestion may repeat (since rank has 1 item) but the title
    // should still be valid.
    const meals = recommendMeals({ suggestionCount: 3, dishesPerMeal: 2, vegetarian: true }, [], [], {}, 'BREAKFAST')
    expect(meals.length).toBe(3)
    expect(meals[0].title.length).toBeGreaterThan(0)
  })

  it('replaces curated fields with the household override', () => {
    const overrides = buildDishOverrideMap([
      { dish_id: 'egg-bhurji', hidden: false, override: { name: 'Anda Bhurji (light)', time: 12 } },
    ])
    const meals = recommendMeals({ suggestionCount: 5, dishesPerMeal: 5, vegetarian: false }, [], [], overrides)
    const egg = meals.flatMap((m) => m.dishes).find((d) => d.id === 'egg-bhurji')
    expect(egg?.name).toBe('Anda Bhurji (light)')
    expect(egg?.time).toBe(12)
  })
})

describe('applyDishOverrides', () => {
  it('drops hidden dishes from the curated list', () => {
    const overrides = buildDishOverrideMap([
      { dish_id: 'dal-tadka', hidden: true, override: null },
    ])
    const result = applyDishOverrides(DISHES, overrides)
    expect(result.some((d) => d.id === 'dal-tadka')).toBe(false)
  })

  it('returns curated fields merged with override fields', () => {
    const overrides = buildDishOverrideMap([
      { dish_id: 'roti', hidden: false, override: { time: 8 } },
    ])
    const result = applyDishOverrides(DISHES, overrides)
    const roti = result.find((d) => d.id === 'roti')
    expect(roti?.time).toBe(8)
    expect(roti?.name).toBe('Ghar ki Roti')  // unchanged
  })

  it('preserves order of the curated list', () => {
    const overrides = buildDishOverrideMap([
      { dish_id: 'dal-tadka', hidden: true, override: null },
      { dish_id: 'roti', hidden: false, override: { time: 8 } },
    ])
    const result = applyDishOverrides(DISHES, overrides)
    const rotiIdx = DISHES.findIndex((d) => d.id === 'roti')
    expect(result.findIndex((d) => d.id === 'roti')).toBe(rotiIdx - 1)  // shifted by the dropped dal
  })
})

describe('mealTitleFromDishes', () => {
  it('returns single dish name when meal has one dish', () => {
    expect(mealTitleFromDishes([{ id: 'a', name: 'Dal', description: '', time: 0, vegetarian: true, kind: 'main', color: '', ingredients: [] }])).toBe('Dal')
  })
  it('joins two dishes with +', () => {
    expect(mealTitleFromDishes([
      { id: 'a', name: 'Dal', description: '', time: 0, vegetarian: true, kind: 'main', color: '', ingredients: [] },
      { id: 'b', name: 'Roti', description: '', time: 0, vegetarian: true, kind: 'bread', color: '', ingredients: [] },
    ])).toBe('Dal + Roti')
  })
  it('uses comma for three+ dishes', () => {
    expect(mealTitleFromDishes([
      { id: 'a', name: 'Dal', description: '', time: 0, vegetarian: true, kind: 'main', color: '', ingredients: [] },
      { id: 'b', name: 'Roti', description: '', time: 0, vegetarian: true, kind: 'bread', color: '', ingredients: [] },
      { id: 'c', name: 'Salad', description: '', time: 0, vegetarian: true, kind: 'side', color: '', ingredients: [] },
    ])).toBe('Dal + Roti + Salad')
  })
})

describe('confirmMeal', () => {
  it('deducts structured recipe quantities from inventory without going below zero', () => {
    const inventory: InventoryItem[] = [
      { id: 'atta', name: 'Atta', quantity: 500, unit: 'g', category: 'monthly', reorderAt: 300, targetStock: 3000 },
      { id: 'bhindi', name: 'Bhindi', quantity: 200, unit: 'g', category: 'weekly', reorderAt: 250, targetStock: 1000 },
    ]

    const updated = confirmMeal(inventory, [
      { ingredientId: 'atta', quantity: 150 },
      { ingredientId: 'bhindi', quantity: 500 },
    ])

    expect(updated.find((item) => item.id === 'atta')?.quantity).toBe(350)
    expect(updated.find((item) => item.id === 'bhindi')?.quantity).toBe(0)
  })

  it('matches by name when inventory uses UUIDs (post-fix behaviour)', () => {
    // After onboarding, user inventory rows from Supabase have UUIDs as id
    // while dish recipes still use string ids like 'atta'. Matching has to
    // be by name, not by id. The previous id-based match left quantities
    // untouched — see issue #7.
    const inventory: InventoryItem[] = [
      { id: 'c3bb6ca9-bd01-439f-8fe1-5e1965302e69', name: 'Atta', quantity: 500, unit: 'g', category: 'monthly', reorderAt: 300, targetStock: 3000 },
      { id: '9b046224-b453-49bc-b509-9c9973f7cecf', name: 'Basmati Rice', quantity: 2200, unit: 'g', category: 'monthly', reorderAt: 1000, targetStock: 5000 },
    ]

    const updated = confirmMeal(inventory, [
      { ingredientId: 'atta', quantity: 200 },
      { ingredientId: 'rice', quantity: 500 },
    ])

    expect(updated.find((i) => i.name === 'Atta')?.quantity).toBe(300)
    expect(updated.find((i) => i.name === 'Basmati Rice')?.quantity).toBe(1700)
  })
})

describe('getOrderSuggestions', () => {
  it('separates perishables into weekly orders and staples into monthly orders', () => {
    const inventory: InventoryItem[] = [
      { id: 'atta', name: 'Atta', quantity: 250, unit: 'g', category: 'monthly', reorderAt: 300, targetStock: 3000 },
      { id: 'tomato', name: 'Tomato', quantity: 150, unit: 'g', category: 'weekly', reorderAt: 300, targetStock: 1000 },
      { id: 'rice', name: 'Rice', quantity: 2000, unit: 'g', category: 'monthly', reorderAt: 500, targetStock: 3000 },
    ]

    const orders = getOrderSuggestions(inventory)

    expect(orders.monthly).toEqual([{ id: 'atta', name: 'Atta', quantity: 2750, unit: 'g' }])
    expect(orders.weekly).toEqual([{ id: 'tomato', name: 'Tomato', quantity: 850, unit: 'g' }])
  })
})

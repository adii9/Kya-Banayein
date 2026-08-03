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

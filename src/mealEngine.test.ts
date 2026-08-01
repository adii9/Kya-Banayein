import { describe, expect, it } from 'vitest'
import { confirmMeal, getOrderSuggestions, recommendMeals, type InventoryItem } from './mealEngine'

describe('recommendMeals', () => {
  it('returns the user-selected number of meal options with the selected number of dishes', () => {
    const meals = recommendMeals({ suggestionCount: 3, dishesPerMeal: 2, vegetarian: true }, [])

    expect(meals).toHaveLength(3)
    expect(meals.every((meal) => meal.dishes.length === 2)).toBe(true)
    expect(meals.flatMap((meal) => meal.dishes).every((dish) => dish.vegetarian)).toBe(true)
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

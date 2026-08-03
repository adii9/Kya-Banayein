export type InventoryItem = {
  id: string
  name: string
  quantity: number
  unit: string
  category: 'weekly' | 'monthly'
  reorderAt: number
  targetStock: number
}

export type IngredientUse = { ingredientId: string; quantity: number }

export type Dish = {
  id: string
  name: string
  description: string
  time: number
  vegetarian: boolean
  kind: 'main' | 'side' | 'bread' | 'rice'
  color: string
  ingredients: IngredientUse[]
}

export type MealOption = {
  id: string
  title: string
  note: string
  dishes: Dish[]
  totalTime: number
  match: number
}

export const DISHES: Dish[] = [
  { id: 'dal-tadka', name: 'Dal Tadka', description: 'Comforting yellow dal with jeera tadka', time: 30, vegetarian: true, kind: 'main', color: '#dca531', ingredients: [{ ingredientId: 'toor-dal', quantity: 180 }, { ingredientId: 'tomato', quantity: 120 }, { ingredientId: 'onion', quantity: 100 }] },
  { id: 'bhindi', name: 'Bhindi Masala', description: 'Dry, homestyle bhindi with onion', time: 25, vegetarian: true, kind: 'side', color: '#4d793d', ingredients: [{ ingredientId: 'bhindi', quantity: 450 }, { ingredientId: 'onion', quantity: 100 }] },
  { id: 'roti', name: 'Ghar ki Roti', description: 'Soft whole-wheat rotis', time: 20, vegetarian: true, kind: 'bread', color: '#b96d35', ingredients: [{ ingredientId: 'atta', quantity: 350 }] },
  { id: 'rajma', name: 'Rajma', description: 'Slow-cooked kidney beans in tomato gravy', time: 45, vegetarian: true, kind: 'main', color: '#923d2f', ingredients: [{ ingredientId: 'rajma', quantity: 250 }, { ingredientId: 'tomato', quantity: 180 }, { ingredientId: 'onion', quantity: 120 }] },
  { id: 'jeera-rice', name: 'Jeera Rice', description: 'Fragrant basmati rice with cumin', time: 25, vegetarian: true, kind: 'rice', color: '#d6b96c', ingredients: [{ ingredientId: 'rice', quantity: 350 }] },
  { id: 'paneer', name: 'Matar Paneer', description: 'Paneer and peas in a light masala', time: 35, vegetarian: true, kind: 'main', color: '#cf7642', ingredients: [{ ingredientId: 'paneer', quantity: 350 }, { ingredientId: 'peas', quantity: 200 }, { ingredientId: 'tomato', quantity: 150 }] },
  { id: 'aloo-gobi', name: 'Aloo Gobi', description: 'Everyday potato and cauliflower sabzi', time: 30, vegetarian: true, kind: 'side', color: '#d08a32', ingredients: [{ ingredientId: 'potato', quantity: 350 }, { ingredientId: 'cauliflower', quantity: 450 }] },
  { id: 'khichdi', name: 'Moong Dal Khichdi', description: 'Light one-pot comfort meal', time: 30, vegetarian: true, kind: 'main', color: '#d9aa42', ingredients: [{ ingredientId: 'moong-dal', quantity: 180 }, { ingredientId: 'rice', quantity: 220 }] },
  { id: 'raita', name: 'Cucumber Raita', description: 'Cooling dahi with cucumber and jeera', time: 10, vegetarian: true, kind: 'side', color: '#82a991', ingredients: [{ ingredientId: 'curd', quantity: 400 }, { ingredientId: 'cucumber', quantity: 200 }] },
  { id: 'egg-bhurji', name: 'Anda Bhurji', description: 'Spiced scrambled eggs with onion', time: 20, vegetarian: false, kind: 'main', color: '#d89534', ingredients: [{ ingredientId: 'eggs', quantity: 6 }, { ingredientId: 'onion', quantity: 100 }, { ingredientId: 'tomato', quantity: 100 }] },
  { id: 'chicken-curry', name: 'Ghar ka Chicken', description: 'Everyday onion-tomato chicken curry', time: 45, vegetarian: false, kind: 'main', color: '#a54f35', ingredients: [{ ingredientId: 'chicken', quantity: 750 }, { ingredientId: 'onion', quantity: 200 }, { ingredientId: 'tomato', quantity: 200 }] },
  { id: 'salad', name: 'Kachumber Salad', description: 'Fresh cucumber, tomato and onion', time: 8, vegetarian: true, kind: 'side', color: '#639659', ingredients: [{ ingredientId: 'cucumber', quantity: 180 }, { ingredientId: 'tomato', quantity: 120 }, { ingredientId: 'onion', quantity: 80 }] },
]

export const DEFAULT_INVENTORY: InventoryItem[] = [
  { id: 'atta', name: 'Atta', quantity: 1200, unit: 'g', category: 'monthly', reorderAt: 800, targetStock: 5000 },
  { id: 'rice', name: 'Basmati Rice', quantity: 2200, unit: 'g', category: 'monthly', reorderAt: 1000, targetStock: 5000 },
  { id: 'toor-dal', name: 'Toor Dal', quantity: 420, unit: 'g', category: 'monthly', reorderAt: 500, targetStock: 2000 },
  { id: 'moong-dal', name: 'Moong Dal', quantity: 700, unit: 'g', category: 'monthly', reorderAt: 400, targetStock: 1500 },
  { id: 'rajma', name: 'Rajma', quantity: 300, unit: 'g', category: 'monthly', reorderAt: 350, targetStock: 1500 },
  { id: 'onion', name: 'Onion', quantity: 850, unit: 'g', category: 'weekly', reorderAt: 500, targetStock: 2000 },
  { id: 'tomato', name: 'Tomato', quantity: 430, unit: 'g', category: 'weekly', reorderAt: 500, targetStock: 1800 },
  { id: 'bhindi', name: 'Bhindi', quantity: 500, unit: 'g', category: 'weekly', reorderAt: 250, targetStock: 1000 },
  { id: 'paneer', name: 'Paneer', quantity: 400, unit: 'g', category: 'weekly', reorderAt: 200, targetStock: 600 },
  { id: 'peas', name: 'Green Peas', quantity: 500, unit: 'g', category: 'weekly', reorderAt: 200, targetStock: 800 },
  { id: 'potato', name: 'Potato', quantity: 1100, unit: 'g', category: 'weekly', reorderAt: 600, targetStock: 2500 },
  { id: 'cauliflower', name: 'Cauliflower', quantity: 500, unit: 'g', category: 'weekly', reorderAt: 300, targetStock: 1000 },
  { id: 'curd', name: 'Curd', quantity: 450, unit: 'g', category: 'weekly', reorderAt: 300, targetStock: 1000 },
  { id: 'cucumber', name: 'Cucumber', quantity: 350, unit: 'g', category: 'weekly', reorderAt: 250, targetStock: 1000 },
  { id: 'eggs', name: 'Eggs', quantity: 8, unit: 'pcs', category: 'weekly', reorderAt: 6, targetStock: 24 },
  { id: 'chicken', name: 'Chicken', quantity: 0, unit: 'g', category: 'weekly', reorderAt: 300, targetStock: 1000 },
]

// A user-authored meal has the same shape as a Dish (and thus can be
// rendered identically). The caller converts rows from user_meals into
// this type before passing to recommendMeals.
export type UserDish = Dish

export const mealNames = ['Ghar ka favourite', 'Light & balanced', 'Quick comfort', 'Family special', 'Simple weekday meal']

// Build a short title from the actual dishes in the meal. Used when the
// caller wants the meal card to read "Rajma + Roti + Salad" instead of
// the generic "Ghar ka favourite". Falls back to the generic label if
// the meal has no dishes.
export const mealTitleFromDishes = (dishes: Dish[]): string => {
  if (dishes.length === 0) return mealNames[0]
  const names = dishes.map((d) => d.name)
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  return `${names[0]} + ${names[1]} + ${names.slice(2).join(', ')}`
}

// Map keyed by curated Dish.id ('dal-tadka', 'chicken-curry', etc.).
// Hidden dishes are excluded entirely; edited dishes have their fields
// replaced (override wins where present, otherwise the curated value
// stays). Built once per render via applyDishOverrides.
export type DishOverrideMap = Record<string, { hidden: boolean; override: Partial<Dish> | null }>

// Build the override map from raw DB rows.
export const buildDishOverrideMap = (rows: { dish_id: string; hidden: boolean; override: Partial<Dish> | null }[]): DishOverrideMap => {
  const map: DishOverrideMap = {}
  for (const r of rows) {
    map[r.dish_id] = { hidden: r.hidden, override: r.override }
  }
  return map
}

// Apply overrides to the curated DISHES list. Returns a new array with
// hidden dishes filtered out and edited dishes field-replaced. Order is
// preserved (important — it controls the order dishes show up on Today
// once filtered by preference + scored by pantry match).
export const applyDishOverrides = (dishes: Dish[], overrides: DishOverrideMap): Dish[] => {
  return dishes.flatMap((d) => {
    const o = overrides[d.id]
    if (!o) return [d]
    if (o.hidden) return []
    if (o.override) return [{ ...d, ...o.override }]
    return [d]
  })
}

export function recommendMeals(
  preferences: { suggestionCount: number; dishesPerMeal: number; vegetarian: boolean },
  inventory: InventoryItem[],
  // Optional user-authored meals. Each one is treated as a dish in the
  // pool; the engine bundles them into the same multi-dish meals the
  // curated DISHES produce. Vegetarian filter applies here too — a user
  // meal with vegetarian=false won't surface in a pure-veg household.
  userMeals: UserDish[] = [],
  // Optional per-household overrides for the curated dishes. Hidden
  // dishes are filtered out; edited dishes have their fields replaced.
  // Pass an empty map (or omit) for the default curated behavior.
  overrides: DishOverrideMap = {},
): MealOption[] {
  const curated = applyDishOverrides(DISHES, overrides)
  const allDishes: Dish[] = [...curated, ...userMeals]
  const eligible = allDishes.filter((dish) => !preferences.vegetarian || dish.vegetarian)
  const stock = new Map(inventory.map((item) => [item.id, item.quantity]))
  const ranked = eligible
    .map((dish) => ({ dish, score: dish.ingredients.reduce((sum, use) => sum + Math.min((stock.get(use.ingredientId) ?? 0) / use.quantity, 1), 0) / Math.max(dish.ingredients.length, 1) }))
    .sort((a, b) => b.score - a.score || a.dish.time - b.dish.time)
    .map(({ dish }) => dish)

  return Array.from({ length: Math.max(1, preferences.suggestionCount) }, (_, optionIndex) => {
    const dishes = Array.from({ length: Math.max(1, preferences.dishesPerMeal) }, (_, dishIndex) => ranked[(optionIndex * preferences.dishesPerMeal + dishIndex) % ranked.length])
    const uses = dishes.flatMap((dish) => dish.ingredients)
    const available = uses.filter((use) => (stock.get(use.ingredientId) ?? 0) >= use.quantity).length
    const match = uses.length ? Math.round((available / uses.length) * 100) : 100
    return {
      id: `meal-${optionIndex}`,
      // Derive title from actual dishes when the pool is rich enough; fall
      // back to the legacy generic label otherwise. Single-dish meals get
      // the dish name; multi-dish meals get a " + " joined title. This
      // makes the home page actually reflect what you're being offered.
      title: mealTitleFromDishes(dishes),
      note: match >= 80 ? 'Mostly from your kitchen' : match >= 50 ? 'A few items needed' : 'Add to your next order',
      dishes,
      totalTime: Math.max(...dishes.map((dish) => dish.time)),
      match,
    }
  })
}

export function confirmMeal(inventory: InventoryItem[], uses: IngredientUse[]): InventoryItem[] {
  const used = new Map<string, number>()
  uses.forEach((use) => used.set(use.ingredientId, (used.get(use.ingredientId) ?? 0) + use.quantity))
  return inventory.map((item) => ({ ...item, quantity: Math.max(0, item.quantity - (used.get(item.id) ?? 0)) }))
}

export function getOrderSuggestions(inventory: InventoryItem[]) {
  const needed = inventory
    .filter((item) => item.quantity <= item.reorderAt)
    .map((item) => ({ id: item.id, name: item.name, quantity: item.targetStock - item.quantity, unit: item.unit, category: item.category }))
  return {
    weekly: needed.filter((item) => item.category === 'weekly').map(({ category: _, ...item }) => item),
    monthly: needed.filter((item) => item.category === 'monthly').map(({ category: _, ...item }) => item),
  }
}

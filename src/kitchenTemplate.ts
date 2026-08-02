// Indian kitchen template — what the onboarding wizard offers users to
// seed their inventory with. Each item is a suggestion with a sensible
// default quantity/unit. The user toggles items on/off and edits
// quantities inline; the wizard then bulk-saves the chosen set into
// their household's inventory_items table.

export type KitchenGroup = {
  id: string
  label: string
  labelHi?: string
  emoji: string
  items: KitchenTemplateItem[]
}

export type KitchenTemplateItem = {
  // Inventory id. Matches the seed ids in mealEngine.ts where possible so
  // recommendMeals can match dishes to inventory by id.
  id: string
  name: string
  // Default quantity and unit when the user first toggles this on.
  defaultQty: number
  defaultUnit: 'g' | 'kg' | 'ml' | 'l' | 'pcs'
  // 'weekly' (fresh produce, dairy) or 'monthly' (staples, spices).
  category: 'weekly' | 'monthly'
  // Optional: how often the user typically runs out. Used as the reorder
  // threshold = defaultQty * 0.4 (so a 1 kg pack reorders at 600 g).
}

export const KITCHEN_GROUPS: KitchenGroup[] = [
  {
    id: 'atta-rice',
    label: 'Atta & Rice',
    labelHi: 'आटा और चावल',
    emoji: '🌾',
    items: [
      { id: 'atta', name: 'Atta (whole wheat)', defaultQty: 5000, defaultUnit: 'g', category: 'monthly' },
      { id: 'maida', name: 'Maida (refined flour)', defaultQty: 1000, defaultUnit: 'g', category: 'monthly' },
      { id: 'besan', name: 'Besan (gram flour)', defaultQty: 500, defaultUnit: 'g', category: 'monthly' },
      { id: 'sooji', name: 'Sooji (semolina)', defaultQty: 500, defaultUnit: 'g', category: 'monthly' },
      { id: 'rice', name: 'Basmati Rice', defaultQty: 5000, defaultUnit: 'g', category: 'monthly' },
      { id: 'rice-sona', name: 'Sona Masoori Rice', defaultQty: 5000, defaultUnit: 'g', category: 'monthly' },
      { id: 'poha', name: 'Poha (flattened rice)', defaultQty: 500, defaultUnit: 'g', category: 'monthly' },
      { id: 'suji', name: 'Rava / Suji', defaultQty: 500, defaultUnit: 'g', category: 'monthly' },
    ],
  },
  {
    id: 'daals-pulses',
    label: 'Daals & Pulses',
    labelHi: 'दाल और दलहन',
    emoji: '🫘',
    items: [
      { id: 'toor-dal', name: 'Toor Dal (arhar)', defaultQty: 2000, defaultUnit: 'g', category: 'monthly' },
      { id: 'moong-dal', name: 'Moong Dal', defaultQty: 1500, defaultUnit: 'g', category: 'monthly' },
      { id: 'chana-dal', name: 'Chana Dal', defaultQty: 1000, defaultUnit: 'g', category: 'monthly' },
      { id: 'urad-dal', name: 'Urad Dal (black gram)', defaultQty: 1000, defaultUnit: 'g', category: 'monthly' },
      { id: 'masoor-dal', name: 'Masoor Dal (red lentil)', defaultQty: 1000, defaultUnit: 'g', category: 'monthly' },
      { id: 'rajma', name: 'Rajma (kidney beans)', defaultQty: 1500, defaultUnit: 'g', category: 'monthly' },
      { id: 'chole', name: 'Chole / Kabuli Chana', defaultQty: 1000, defaultUnit: 'g', category: 'monthly' },
      { id: 'rajma-chitra', name: 'Chitra Rajma', defaultQty: 500, defaultUnit: 'g', category: 'monthly' },
      { id: 'urad-dal-split', name: 'Chilkewali Urad', defaultQty: 500, defaultUnit: 'g', category: 'monthly' },
    ],
  },
  {
    id: 'spices-masalas',
    label: 'Spices & Masalas',
    labelHi: 'मसाले',
    emoji: '🌶️',
    items: [
      { id: 'haldi', name: 'Haldi (turmeric)', defaultQty: 200, defaultUnit: 'g', category: 'monthly' },
      { id: 'mirch', name: 'Lal Mirch (red chilli)', defaultQty: 200, defaultUnit: 'g', category: 'monthly' },
      { id: 'mirch-green', name: 'Hari Mirch (green chilli)', defaultQty: 100, defaultUnit: 'g', category: 'weekly' },
      { id: 'jeera', name: 'Jeera (cumin)', defaultQty: 200, defaultUnit: 'g', category: 'monthly' },
      { id: 'dhania', name: 'Dhania (coriander seeds)', defaultQty: 200, defaultUnit: 'g', category: 'monthly' },
      { id: 'garam-masala', name: 'Garam Masala', defaultQty: 200, defaultUnit: 'g', category: 'monthly' },
      { id: 'hing', name: 'Hing (asafoetida)', defaultQty: 50, defaultUnit: 'g', category: 'monthly' },
      { id: 'saunf', name: 'Saunf (fennel)', defaultQty: 100, defaultUnit: 'g', category: 'monthly' },
      { id: 'methi-dana', name: 'Methi Dana (fenugreek)', defaultQty: 100, defaultUnit: 'g', category: 'monthly' },
      { id: 'kalonji', name: 'Kalonji (nigella)', defaultQty: 50, defaultUnit: 'g', category: 'monthly' },
      { id: 'ajwain', name: 'Ajwain (carom seeds)', defaultQty: 50, defaultUnit: 'g', category: 'monthly' },
      { id: 'amchur', name: 'Amchur (dry mango powder)', defaultQty: 100, defaultUnit: 'g', category: 'monthly' },
    ],
  },
  {
    id: 'oils-dairy',
    label: 'Oils, Ghee & Dairy',
    labelHi: 'तेल, घी और डेयरी',
    emoji: '🥛',
    items: [
      { id: 'mustard-oil', name: 'Sarson Ka Tel (mustard oil)', defaultQty: 1000, defaultUnit: 'ml', category: 'monthly' },
      { id: 'refined-oil', name: 'Refined Oil (vanaspati)', defaultQty: 1000, defaultUnit: 'ml', category: 'monthly' },
      { id: 'olive-oil', name: 'Olive Oil', defaultQty: 500, defaultUnit: 'ml', category: 'monthly' },
      { id: 'ghee', name: 'Ghee', defaultQty: 500, defaultUnit: 'g', category: 'monthly' },
      { id: 'curd', name: 'Dahi (curd)', defaultQty: 500, defaultUnit: 'g', category: 'weekly' },
      { id: 'paneer', name: 'Paneer', defaultQty: 200, defaultUnit: 'g', category: 'weekly' },
      { id: 'milk', name: 'Milk', defaultQty: 1000, defaultUnit: 'ml', category: 'weekly' },
      { id: 'eggs', name: 'Eggs', defaultQty: 12, defaultUnit: 'pcs', category: 'weekly' },
      { id: 'chicken', name: 'Chicken', defaultQty: 500, defaultUnit: 'g', category: 'weekly' },
      { id: 'paneer-tofu', name: 'Tofu', defaultQty: 200, defaultUnit: 'g', category: 'weekly' },
    ],
  },
  {
    id: 'fresh-vegetables',
    label: 'Fresh Vegetables',
    labelHi: 'ताज़ी सब्ज़ियाँ',
    emoji: '🥬',
    items: [
      { id: 'onion', name: 'Pyaz (onion)', defaultQty: 2000, defaultUnit: 'g', category: 'weekly' },
      { id: 'tomato', name: 'Tamatar (tomato)', defaultQty: 1500, defaultUnit: 'g', category: 'weekly' },
      { id: 'potato', name: 'Aloo (potato)', defaultQty: 2000, defaultUnit: 'g', category: 'weekly' },
      { id: 'bhindi', name: 'Bhindi (okra)', defaultQty: 500, defaultUnit: 'g', category: 'weekly' },
      { id: 'cauliflower', name: 'Phool Gobhi (cauliflower)', defaultQty: 500, defaultUnit: 'g', category: 'weekly' },
      { id: 'peas', name: 'Matar (peas)', defaultQty: 500, defaultUnit: 'g', category: 'weekly' },
      { id: 'cucumber', name: 'Kheera (cucumber)', defaultQty: 500, defaultUnit: 'g', category: 'weekly' },
      { id: 'ginger', name: 'Adrak (ginger)', defaultQty: 100, defaultUnit: 'g', category: 'weekly' },
      { id: 'garlic', name: 'Lahsun (garlic)', defaultQty: 100, defaultUnit: 'g', category: 'weekly' },
      { id: 'coriander-leaves', name: 'Dhania Patta (coriander)', defaultQty: 50, defaultUnit: 'g', category: 'weekly' },
      { id: 'mint', name: 'Pudina (mint)', defaultQty: 30, defaultUnit: 'g', category: 'weekly' },
      { id: 'lemon', name: 'Nimbu (lemon)', defaultQty: 6, defaultUnit: 'pcs', category: 'weekly' },
    ],
  },
]

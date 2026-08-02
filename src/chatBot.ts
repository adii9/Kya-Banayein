export type ChatIntent =
  | { kind: 'preference'; action: 'set-vegetarian'; value: boolean }
  | { kind: 'preference'; action: 'set-suggestions'; value: number }
  | { kind: 'preference'; action: 'set-dishes'; value: number }
  | { kind: 'preference'; action: 'set-members'; value: number }
  | { kind: 'feed'; dislike: string | null; like: string | null }
  // F3 — chat-driven inventory updates. The chat returns a parsed intent
  // and the App applies it. We don't return a target ingredient id (the
  // matcher uses substring lookup on the dish keyword table).
  | { kind: 'inventory'; action: 'add'; itemName: string; quantity: number; unit: string }
  | { kind: 'inventory'; action: 'use'; itemName: string; quantity: number; unit: string }
  // F2/F4 — plan a meal slot. Caller passes the date as ISO YYYY-MM-DD.
  | { kind: 'plan'; slot: 'BREAKFAST' | 'LUNCH' | 'DINNER'; dishName: string; mood?: string }
  // F5 — voter-keyed preference. We don't bind to a specific voter in the
  // intent; the App applies it to the active voter (or first one).
  | { kind: 'preference-record'; mealName: string; slot: 'BREAKFAST' | 'LUNCH' | 'DINNER' | null; dayOfWeek?: number }
  | { kind: 'unknown'; reply: string }
const REPLY_HI = 'मैं सिर्फ खाने से जुड़ी बातें समझता हूँ—जैसे शाकाहारी, सुझाव, या पसंद।'
const REPLY_TA = 'நான் சாப்பாட்டு விஷயங்கள் மட்டும் தான் புரிந்துகொள்கிறேன்.'
const REPLY_TE = 'నేను ఆహారం గురించి మాత్రమే అర్థం చేసుకుంటాను.'
const REPLY_KN = 'ನಾನು ಊಟದ ವಿಷಯ ಮಾತ್ರ ಅರ್ಥ ಮಾಡಿಕೊಳ್ಳುತ್ತೇನೆ.'
const REPLY_BN = 'আমি শুধু খাবারের কথা বুঝি।'

const detect = (text: string) => /[ऀ-ॿ]/.test(text) ? 'hi'
  : /[஀-௿]/.test(text) ? 'ta'
  : /[ఀ-౿]/.test(text) ? 'te'
  : /[ಀ-೿]/.test(text) ? 'kn'
  : /[ঀ-৿]/.test(text) ? 'bn'
  : 'en'

const NUMBER_WORDS: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
  'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5, 'cheh': 6, 'saat': 7, 'aath': 8,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'छह': 6, 'सात': 7, 'आठ': 8,
  'ஒன்று': 1, 'இரண்டு': 2, 'மூன்று': 3, 'நான்கு': 4, 'ஐந்து': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8,
  'ఒకటి': 1, 'రెండు': 2, 'మూడు': 3, 'నాలుగు': 4, 'ఐదు': 5, 'ఆరు': 6, 'ఏడు': 7, 'ఎనిమిది': 8,
  'ಒಂದು': 1, 'ಎರಡು': 2, 'ಮೂರು': 3, 'ನಾಲ್ಕು': 4, 'ಐದು': 5, 'ಆರು': 6, 'ಏಳು': 7, 'ಎಂಟು': 8,
  'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5, 'ছয়': 6, 'সাত': 7, 'আট': 8, '১': 1, '২': 2, '৩': 3, '৪': 4, '৫': 5, '৬': 6, '৭': 7, '৮': 8,
}

const findNumber = (text: string): number | null => {
  const digits = text.match(/\d+/)?.[0]
  if (digits) return Math.min(6, Math.max(1, parseInt(digits, 10)))
  for (const word of Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length)) {
    if (text.toLowerCase().includes(word)) return NUMBER_WORDS[word]
  }
  return null
}

const VEG_HINTS = ['शाकाहारी', 'सात्विक', 'veg', 'vegetarian', 'सब्ज़ी', 'सब्जी', 'no meat', 'no egg', 'சைவ', 'shaivam', 'సాత్విక', 'ಶಾಖ', 'শাক']
const NON_VEG_HINTS = ['मांस', 'मुर्गा', 'अंडा', 'मछली', 'non-veg', 'non veg', 'nonvegetarian', 'சைவம் கிடையாது', 'मांसाहारी', 'माँसाहारी', 'மாம்சம்', 'மாம்ச', 'మాంస', 'ಮಾಂಸ', 'আমিষ']
const SUGGEST_HINTS = ['suggest', 'suggestion', 'option', 'प्रस्ताव', 'सुझाव', 'ऑप्शन', 'சிபாரிப்பு', 'సూచనలు', 'సూచన', 'ಸಲಹೆಗಳು', 'পরামর্শ', 'প্রস্তাব', 'చూపించు', 'காட்டு']
const DISHES_HINTS = ['dish', 'dishes', 'पद', 'व्यंजन', 'பதம்', 'వంటకాలు', 'ತಿನಿಸುಗಳು', 'পদ', 'খাবার', 'বেলায়', 'বেলা']
const MEMBER_HINTS = ['people', 'person', 'member', 'log', 'लोग', 'व्यक्ति', 'मेंबर', 'माणूस', 'ন', 'మంది', 'நபர்கள்', 'ಜನರು', 'পরিবার']
const DISLIKE_HINTS = ['नहीं चाहिए', 'मत बनाओ', 'बेड', 'கூடாது', 'వద్దు', 'ಬೇಡ', 'না', 'no ', 'don\'t', 'dislike', 'avoid', 'बिना']
const LIKE_HINTS = ['चाहिए', 'बनाओ', 'பிடிக்கும்', 'కావాలి', 'ಬೇಕು', 'চাই', 'love', 'like', 'want', 'need']

const DISH_KEYWORDS: Record<string, string> = {
  'egg': 'eggs', 'eggs': 'eggs', 'अंडा': 'eggs', 'अंडे': 'eggs', 'मुर्गा': 'chicken', 'चिकन': 'chicken', 'chicken': 'chicken',
  'मछली': 'fish', 'fish': 'fish', 'மீன்': 'fish', 'చేప': 'fish', 'ಮೀನು': 'fish', 'মাছ': 'fish',
  'paneer': 'paneer', 'पनीर': 'paneer', 'பன்னீர்': 'paneer', 'పనీర్': 'paneer', 'ಪನೀರ್': 'paneer', 'পনির': 'paneer',
  'mushroom': 'mushroom', 'मशरूम': 'mushroom',
  'prawn': 'prawn', 'prawns': 'prawns', 'झींगा': 'prawns',
  'mutton': 'mutton', 'मटन': 'mutton', 'ஆட்டு': 'mutton', 'మటన్': 'mutton', 'ಕುರಿ': 'mutton', 'খাসি': 'mutton',
}

export function parseCommand(input: string): ChatIntent {
  const text = input.trim()
  if (!text) return { kind: 'unknown', reply: REPLY_HI }
  const lower = text.toLowerCase()
  const lang = detect(text)

  if (NON_VEG_HINTS.some((h) => lower.includes(h))) {
    return { kind: 'preference', action: 'set-vegetarian', value: false }
  }
  if (VEG_HINTS.some((h) => lower.includes(h))) {
    return { kind: 'preference', action: 'set-vegetarian', value: true }
  }

  if (SUGGEST_HINTS.some((h) => lower.includes(h))) {
    const n = findNumber(text)
    if (n !== null) return { kind: 'preference', action: 'set-suggestions', value: n }
  }
  if (DISHES_HINTS.some((h) => lower.includes(h))) {
    const n = findNumber(text)
    if (n !== null) return { kind: 'preference', action: 'set-dishes', value: n }
  }
  if (MEMBER_HINTS.some((h) => lower.includes(h)) || lower.includes('চাই')) {
    const n = findNumber(text)
    if (n !== null) {
      return { kind: 'preference', action: lower.includes('প্রতি বেলায়') || lower.includes('বেলায়') ? 'set-dishes' : 'set-members', value: n }
    }
  }

  const dislike = DISLIKE_HINTS.some((h) => lower.includes(h)) ? matchDish(lower) : null
  const like = !dislike && LIKE_HINTS.some((h) => lower.includes(h)) ? matchDish(lower) : null
  if (dislike || like) return { kind: 'feed', dislike, like }

  // F3 — inventory updates via chat. Match "add 2 kg rice" / "I used 3 eggs".
  const inventoryAction = (() => {
    if (/\b(added|got|bought|stocked)\b/.test(lower) || /\b(add|kharid|ख़रीद|கொள்|కొన్నాను|ತಂದೆ)\b/.test(lower)) return 'add' as const
    if (/\b(used|consumed|finished|ran out)\b/.test(lower) || /\b(use|khatam|ख़तम|use చేసాను|ಬಳಸಿದೆ)\b/.test(lower)) return 'use' as const
    return null
  })()
  if (inventoryAction) {
    const n = findNumber(text)
    if (n !== null) {
      const item = matchDish(lower) ?? extractNoun(lower)
      if (item) {
        const unit = matchUnit(lower)
        return { kind: 'inventory', action: inventoryAction, itemName: item, quantity: n, unit }
      }
    }
  }

  // F2/F4 — plan a slot. "make dinner spicy", "breakfast should be poha tomorrow",
  // "tonight I want rajma" → returns a plan intent with the slot.
  const slot = (() => {
    if (/\b(breakfast|सुबह|నాస్తే|காலை|ಬೆಳಗ್ಗೆ|সকাল|ناشتا)\b/.test(lower)) return 'BREAKFAST' as const
    if (/\b(lunch|दोपहर|భోజనం|மதியம்|ಮಧ್ಯಾಹ್ನ|দুপুর)\b/.test(lower)) return 'LUNCH' as const
    if (/\b(dinner|रात|रात का|భోజనం|இரவு|ರಾತ್ರಿ|রাতে|సాయంత్రం)\b/.test(lower)) return 'DINNER' as const
    return null
  })()
  if (slot) {
    const mood = /\b(spicy|तिखटा|கார|చేదు|ಖಾರ|মশলাদার)\b/.test(lower) ? 'spicy'
      : /\b(light|हल्का|லight|తేలికైన|ಲಘು)\b/.test(lower) ? 'light'
      : /\b(comfort|आराम|comfort|comfort|comfort|comfort|comfort|comfort|comfort|comfort)\b/.test(lower) ? 'comfort'  // keep simple
      : undefined
    const dishName = matchDish(lower) ?? extractNoun(lower)
    if (dishName) return { kind: 'plan', slot, dishName, mood }
  }

  return { kind: 'unknown', reply: ({ hi: REPLY_HI, ta: REPLY_TA, te: REPLY_TE, kn: REPLY_KN, bn: REPLY_BN } as Record<string, string>)[lang] ?? REPLY_HI }
}

const UNIT_WORDS: Record<string, string> = {
  'g': 'g', 'gram': 'g', 'grams': 'g', 'gm': 'g',
  'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'ml': 'ml', 'l': 'l', 'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l',
  'pc': 'pcs', 'pcs': 'pcs', 'piece': 'pcs', 'pieces': 'pcs',
  'एक': 'pcs', 'दो': 'pcs',  // ignore numbers-as-units
  'ग्राम': 'g', 'किलो': 'kg', 'लीटर': 'l', 'पीस': 'pcs',
  'கிராம்': 'g', 'கிலோ': 'kg', 'லிட்டர்': 'l',
}

const matchUnit = (lower: string): string => {
  for (const [word, unit] of Object.entries(UNIT_WORDS)) {
    if (lower.includes(word)) return unit
  }
  // default: count as pieces for small items, g otherwise
  return 'g'
}

const extractNoun = (lower: string): string | null => {
  // Strip verbs, articles, and common words. Return what's left as a guess
  // for the item name. Crude but the chat is best-effort — the user can
  // always correct via the kitchen tab.
  const stop = new Set(['add', 'use', 'i', 'we', 'got', 'bought', 'stocked', 'used', 'consumed', 'finished', 'kharid', 'ख़रीद', 'khatam', 'ख़तम', 'please', 'a', 'an', 'the', 'to', 'for', 'with', 'on', 'some', 'more'])
  const words = lower.split(/[^a-z0-9\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0980-\u09FF]+/i).filter((w) => w.length > 1 && !stop.has(w) && !/^\d+$/.test(w))
  if (words.length === 0) return null
  // Prefer the longest word; that's usually the noun.
  return words.sort((a, b) => b.length - a.length)[0]
}

const matchDish = (lower: string): string | null => {
  for (const [key, value] of Object.entries(DISH_KEYWORDS)) {
    if (lower.includes(key)) return value
  }
  return null
}

export const SUPPORTED_LANGS: { code: string; label: string }[] = [
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'en-IN', label: 'English' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
]

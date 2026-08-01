export type ChatIntent =
  | { kind: 'preference'; action: 'set-vegetarian'; value: boolean }
  | { kind: 'preference'; action: 'set-suggestions'; value: number }
  | { kind: 'preference'; action: 'set-dishes'; value: number }
  | { kind: 'preference'; action: 'set-members'; value: number }
  | { kind: 'feed'; dislike: string | null; like: string | null }
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

  return { kind: 'unknown', reply: ({ hi: REPLY_HI, ta: REPLY_TA, te: REPLY_TE, kn: REPLY_KN, bn: REPLY_BN } as Record<string, string>)[lang] ?? REPLY_HI }
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

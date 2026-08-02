import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check, ChevronRight, Clock3, Eye, EyeOff, LogOut, MessageCircle, Mic, MicOff, Minus, Package, Plus, RotateCcw, Send, Settings2, Share2, ShoppingBasket, Sparkles, Users, UtensilsCrossed, Volume2, Vote, X } from 'lucide-react'
import './App.css'
import { confirmMeal, DEFAULT_INVENTORY, getOrderSuggestions, recommendMeals, type InventoryItem, type MealOption } from './mealEngine'
import { parseCommand, SUPPORTED_LANGS, type ChatIntent } from './chatBot'
import { addVoter as _addVoter, buildWhatsAppShareUrl, castVote as _castVote, createPoll, getResults, type Poll, type PollResult } from './voting'
import { supabase, SUPABASE_URL } from './supabase'
import * as api from './api'
import { KITCHEN_GROUPS, type KitchenTemplateItem } from './kitchenTemplate'
import type { Dislike } from './api'

type Tab = 'today' | 'inventory' | 'orders' | 'family' | 'household' | 'onboarding' | 'join'

type Preferences = {
  familyName: string
  members: number
  suggestionCount: number
  dishesPerMeal: number
  vegetarian: boolean
  dislikes: Dislike[]  // rich structure; see api.Dislike
}

type ChatTurn = { from: 'user' | 'bot'; text: string; intent?: ChatIntent }

type VotingState = {
  enabled: boolean
  poll: Poll
  shareAll: boolean
}

const DEFAULT_PREFERENCES: Preferences = {
  familyName: 'My Kitchen',
  members: 4,
  suggestionCount: 3,
  dishesPerMeal: 3,
  vegetarian: false,
  dislikes: [],
}

const DEFAULT_VOTING: VotingState = { enabled: false, poll: createPoll([]), shareAll: true }

// Migrations: older versions of the app stored dislikes as a flat
// string[]. The new schema is Dislike[] (with optional slot / dayOfWeek).
// On load, convert any old shape to the new one so existing users
// don't lose their data.
const migratePreferences = (p: any): Preferences => {
  if (!p || typeof p !== 'object') return DEFAULT_PREFERENCES
  const raw = p.dislikes
  let dislikes: Dislike[]
  if (Array.isArray(raw)) {
    if (raw.length === 0) dislikes = []
    else if (typeof raw[0] === 'string') {
      // Old shape: string[]
      dislikes = (raw as string[]).filter((s) => typeof s === 'string' && s.length > 0).map((s) => ({ name: s }))
    } else {
      // Already Dislike[] but maybe malformed; keep what's well-formed
      dislikes = (raw as any[]).filter((d) => d && typeof d.name === 'string' && d.name.length > 0).map((d) => ({
        name: d.name,
        slot: d.slot ?? null,
        dayOfWeek: typeof d.dayOfWeek === 'number' ? d.dayOfWeek : null,
      }))
    }
  } else {
    dislikes = []
  }
  return {
    familyName: typeof p.familyName === 'string' ? p.familyName : 'My Kitchen',
    members: typeof p.members === 'number' ? p.members : 4,
    suggestionCount: typeof p.suggestionCount === 'number' ? p.suggestionCount : 3,
    dishesPerMeal: typeof p.dishesPerMeal === 'number' ? p.dishesPerMeal : 3,
    vegetarian: typeof p.vegetarian === 'boolean' ? p.vegetarian : false,
    dislikes,
  }
}

const load = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}

const SR = (): typeof SpeechRecognition | null => {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const generateCode = (): string => {
  let out = ''
  for (let i = 0; i < 5; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

function Counter({ value, setValue, min = 1, max = 6 }: { value: number; setValue: (value: number) => void; min?: number; max?: number }) {
  return <div className="counter-control">
    <button aria-label="Decrease" onClick={() => setValue(Math.max(min, value - 1))}><Minus size={18} /></button>
    <strong>{value}</strong>
    <button aria-label="Increase" onClick={() => setValue(Math.min(max, value + 1))}><Plus size={18} /></button>
  </div>
}

function speak(text: string, lang: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = lang
  utter.rate = 0.95
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}

function CustomInventoryAdder({ householdId, onAdd }: { householdId: string | null; onAdd: (item: any) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('500')
  const [unit, setUnit] = useState('g')
  const [category, setCategory] = useState<'weekly' | 'monthly'>('weekly')
  const [busy, setBusy] = useState(false)
  if (!householdId) return null
  const submit = async () => {
    const q = parseFloat(quantity)
    if (!name.trim() || isNaN(q) || q <= 0) return
    setBusy(true)
    try {
      const { id } = await api.addCustomInventoryItem(householdId, { name: name.trim(), quantity: q, unit, category })
      onAdd({ id, name: name.trim(), quantity: q, unit, category, reorderAt: Math.max(1, Math.floor(q * 0.5)), targetStock: q, custom: true })
      setName(''); setQuantity('500'); setUnit('g'); setCategory('weekly')
      setOpen(false)
    } catch (e: any) {
      console.error('Add custom item failed:', e)
      alert('Could not add that item. Try again.')
    } finally { setBusy(false) }
  }
  if (!open) return <div className="custom-adder-trigger"><button className="secondary" onClick={() => setOpen(true)}><Plus size={16} /> Add custom item</button></div>
  return <div className="custom-adder">
    <h3>Add custom item</h3>
    <p>Use this for ingredients we don't ship by default — methi, tofu, mushrooms, special masalas, etc.</p>
    <div className="custom-adder-grid">
      <label><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Methi leaves" autoFocus /></label>
      <label><span>Quantity</span><input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
      <label><span>Unit</span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="g">grams (g)</option>
          <option value="kg">kilograms (kg)</option>
          <option value="ml">millilitres (ml)</option>
          <option value="l">litres (l)</option>
          <option value="pcs">pieces</option>
        </select>
      </label>
      <label><span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as 'weekly' | 'monthly')}>
          <option value="weekly">Fresh · weekly</option>
          <option value="monthly">Staple · monthly</option>
        </select>
      </label>
    </div>
    <div className="custom-adder-actions">
      <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Adding…' : 'Add to kitchen'}</button>
      <button className="reset-button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  </div>
}

function OrderListEditor({ title, subtitle, baseItems, slot, householdId, customItems, onChange, shareText, onShare, empty }: {
  title: string
  subtitle: string
  baseItems: { id: string; name: string; quantity: number; unit: string }[]
  slot: 'weekly' | 'monthly'
  householdId: string
  customItems: { id: string; name: string; quantity: number; unit: string }[]
  onChange: () => void
  shareText: string
  onShare: (text: string) => void
  empty: string
}) {
  // Combine base + custom, then subtract removed. Persists to order_overrides.
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('500')
  const [newUnit, setNewUnit] = useState('g')
  const [busy, setBusy] = useState(false)

  // Load existing overrides on mount.
  useEffect(() => {
    let cancelled = false
    api.fetchOrderOverrides(householdId).then((rows) => {
      if (cancelled) return
      const removedIds = new Set<string>()
      rows.forEach((r) => { if (r.slot === slot && r.action === 'remove' && r.inventory_id) removedIds.add(r.inventory_id) })
      setRemoved(removedIds)
    })
    return () => { cancelled = true }
  }, [householdId, slot])

  const items = [
    ...baseItems.filter((b) => !removed.has(b.id)),
    ...customItems,
  ]
  const remove = async (id: string) => {
    if (!window.confirm(`Remove ${items.find((i) => i.id === id)?.name ?? 'item'} from this list?`)) return
    setBusy(true)
    try {
      await api.addOrderOverride({ household_id: householdId, slot, inventory_id: id, custom_name: null, custom_quantity: null, custom_unit: null, custom_category: null, action: 'remove' })
      setRemoved((prev) => new Set(prev).add(id))
      onChange()
    } finally { setBusy(false) }
  }
  const addCustom = async () => {
    const q = parseFloat(newQty)
    if (!newName.trim() || isNaN(q) || q <= 0) return
    setBusy(true)
    try {
      await api.addOrderOverride({ household_id: householdId, slot, inventory_id: null, custom_name: newName.trim(), custom_quantity: q, custom_unit: newUnit, custom_category: slot, action: 'add' })
      onChange()
      setNewName(''); setNewQty('500'); setNewUnit('g'); setAdding(false)
    } finally { setBusy(false) }
  }
  return <article className="order-card">
    <div className="order-head"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{items.length}</span></div>
    {items.length === 0 ? <div className="empty-state"><Check size={22} />{empty}</div>
      : <ul>{items.map((item) => <li key={item.id}>
          <label><input type="checkbox" checked /><span><b>{item.name}</b><small>Bring stock back to target</small></span></label>
          <strong>{item.quantity.toLocaleString()} {item.unit}</strong>
          {baseItems.find((b) => b.id === item.id) && <button className="remove-item" aria-label={`Remove ${item.name}`} disabled={busy} onClick={() => remove(item.id)}><X size={14} /></button>}
        </li>)}</ul>}
    {adding ? <div className="add-custom-row">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Item name" autoFocus />
        <input type="number" min="0" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="qty" />
        <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
          <option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="pcs">pcs</option>
        </select>
        <button className="primary mini" disabled={busy} onClick={addCustom}>Add</button>
        <button className="reset-button mini" onClick={() => setAdding(false)}>Cancel</button>
      </div>
      : <div className="order-edit-actions"><button className="secondary mini" onClick={() => setAdding(true)}><Plus size={14} /> Add to this list</button></div>}
    {items.length > 0 && <button className="secondary" onClick={() => onShare(shareText)}><Share2 size={17} /> Share list on WhatsApp</button>}
  </article>
}

function SignIn() {
  const signInWithGoogle = async () => {
    // Redirect back to where the user started, not always to prod. In dev
    // (localhost:5173) this brings the OAuth callback back to the dev
    // server, so sign-in works locally. In prod (kya-banayein-theta.vercel.app)
    // it goes back to the same URL. The earlier hardcoded value forced all
    // sign-ins to prod, which broke local testing.
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : 'https://kya-banayein-theta.vercel.app'
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }
  return <div className="auth-screen">
    <div className="auth-card">
      <span className="brand-mark"><UtensilsCrossed size={28} /></span>
      <h1>Kya Banayein?</h1>
      <p>Aaj kya banayein — ab app decide karega.<br/>Continue with Google to start.</p>
      <button className="google-btn" onClick={signInWithGoogle}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
        Continue with Google
      </button>
      <small>By continuing, you agree to save your household data on Supabase.</small>
    </div>
  </div>
}

function TutorialOverlay({ step, totalSteps, onNext, onSkip }: {
  step: number
  totalSteps: number
  onNext: () => void
  onSkip: () => void
}) {
  // Three steps. Each is a small "tip" card pinned to a corner of the
  // screen so the user can still see the UI behind it. The card has a
  // back-arrow on step 2+, a Next button, and a Skip link.
  const TIPS = [
    {
      title: 'Pick a meal you like',
      body: 'Tap any meal card below. We show you 3 options by default — change the count with the steppers above.',
      target: 'meal-grid',
      cta: 'Got it',
    },
    {
      title: 'Confirm to update your kitchen',
      body: 'When you tap "Confirm meal & use stock", we deduct the ingredients from your kitchen. No more guessing what you have.',
      target: 'confirmation-bar',
      cta: 'Next',
    },
    {
      title: 'Try the assistant',
      body: 'Tap the chat bubble (bottom-right) to say things like "5 options दिखाओ" or "मैं शाकाहारी हूँ" — it learns your preferences.',
      target: 'chat-fab',
      cta: 'Done',
    },
  ]
  const t = TIPS[Math.min(step, TIPS.length - 1)]
  return <div className="tutorial-overlay" role="dialog" aria-label="Getting started">
    <div className={`tutorial-tip tutorial-target-${t.target}`}>
      <span className="tutorial-progress">Step {step + 1} of {totalSteps}</span>
      <h3>{t.title}</h3>
      <p>{t.body}</p>
      <div className="tutorial-actions">
        {step > 0 && <button className="reset-button" onClick={() => { /* back handled by parent via onNext with step-1 */ }} aria-label="Back">← Back</button>}
        <button className="reset-button" onClick={onSkip}>Skip tour</button>
        <button className="primary" onClick={onNext}>{t.cta}</button>
      </div>
    </div>
  </div>
}

function JoinScreen({ code, household, onJoin, onCancel, busy }: {
  code: string
  household?: { id: string; name: string }
  onJoin: (name: string) => Promise<void>
  onCancel: () => void
  busy: boolean
}) {
  const [name, setName] = useState('')
  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await onJoin(trimmed)
  }
  return <div className="auth-screen">
    <div className="onboarding-card">
      <span className="eyebrow"><Users size={14} /> JOIN A KITCHEN</span>
      <h1>You're invited to vote</h1>
      {household
        ? <p><b>{household.name}</b> wants you to vote on tonight's dinner. Pick a name to join their kitchen.</p>
        : <p>You've been invited to vote on tonight's dinner with code <code>{code}</code>, but no kitchen was found for it. Double-check the link with whoever sent it.</p>}
      {household && <>
        <label className="onboarding-field">
          <span>Your name in their kitchen</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diya, Papa, Nani" autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <div className="onboarding-actions">
          <button className="primary" disabled={busy || !name.trim()} onClick={submit}>{busy ? 'Joining…' : 'Join kitchen'}</button>
          <button className="reset-button" disabled={busy} onClick={onCancel}>No, thanks</button>
        </div>
      </>}
      {!household && <div className="onboarding-actions">
        <button className="reset-button" onClick={onCancel}>Back to my kitchen</button>
      </div>}
    </div>
  </div>
}

// =============================================================================
// KitchenOnboarding — multi-step wizard that replaces the original 3-question
// form. Steps:
//   1. Welcome: household name + vegetarian toggle (with skip option)
//   2..N. One step per KITCHEN_GROUPS entry, showing toggleable items
//   N+1. Summary: "you've picked N items, finish" + bulk-save
//
// The user can navigate back/forward between steps, skip the whole thing,
// or skip individual groups. Selected items are tracked in local state
// during the wizard and bulk-saved at the end via api.bulkReplaceInventory.
// =============================================================================
function KitchenOnboarding({ session, onComplete }: { session: Session; onComplete: (household: api.Household) => void }) {
  // Wizard state.
  const [stepIdx, setStepIdx] = useState(0)
  const steps = useMemo(() => ['welcome', ...KITCHEN_GROUPS.map((g) => g.id), 'summary'] as const, [])

  // The selected items live in a map keyed by item id. Each entry holds
  // the display name (so custom items without a template entry still
  // round-trip through bulk-replace), the quantity and the unit. Template
  // items use the template's name; custom items get a 'custom-' prefixed
  // id and a user-supplied name.
  const [picks, setPicks] = useState<Record<string, { name: string; qty: number; unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' }>>({})
  // Custom-item form state, per group. Keyed by groupId so the form
  // remembers its half-filled state when the user navigates back.
  const [customDraft, setCustomDraft] = useState<Record<string, { name: string; qty: string; unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' }>>({})

  // Welcome-step state.
  const [name, setName] = useState('My Kitchen')
  const [vegetarian, setVegetarian] = useState(false)
  const [voting, setVoting] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStep = steps[stepIdx]
  const currentGroup = currentStep === 'welcome' || currentStep === 'summary'
    ? null
    : KITCHEN_GROUPS.find((g) => g.id === currentStep) ?? null

  const totalPicks = Object.keys(picks).length

  const toggleItem = (item: KitchenTemplateItem) => {
    setPicks((prev) => {
      const next = { ...prev }
      if (next[item.id]) {
        delete next[item.id]
      } else {
        next[item.id] = { name: item.name, qty: item.defaultQty, unit: item.defaultUnit }
      }
      return next
    })
  }

  const updatePick = (itemId: string, patch: Partial<{ qty: number; unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' }>) => {
    setPicks((prev) => {
      if (!prev[itemId]) return prev
      return { ...prev, [itemId]: { ...prev[itemId], ...patch } }
    })
  }

  // Add a custom item (typed by the user) to the picks map and clear the
  // group's draft form. The id is a real UUID so it round-trips through
  // the inventory_items.id column (which is uuid-typed). The name is
  // whatever the user typed. We don't validate the name — the
  // inventory_items.name column is text.
  const addCustomItem = (group: typeof KITCHEN_GROUPS[number]) => {
    const draft = customDraft[group.id]
    if (!draft || !draft.name.trim()) return
    const qty = parseFloat(draft.qty) || 0
    if (qty <= 0) return
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? `custom-${crypto.randomUUID()}`
      : `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    setPicks((prev) => ({ ...prev, [id]: { name: draft.name.trim(), qty, unit: draft.unit } }))
    setCustomDraft((prev) => ({ ...prev, [group.id]: { name: '', qty: '500', unit: 'g' } }))
  }

  // Bulk-toggle a whole group: if all items in it are picked, uncheck all;
  // otherwise check all. Saves the user from a long tap-through.
  const toggleGroup = (group: typeof KITCHEN_GROUPS[number]) => {
    const allPicked = group.items.every((it) => picks[it.id])
    setPicks((prev) => {
      const next = { ...prev }
      if (allPicked) {
        group.items.forEach((it) => delete next[it.id])
      } else {
        group.items.forEach((it) => {
          if (!next[it.id]) next[it.id] = { name: it.name, qty: it.defaultQty, unit: it.defaultUnit }
        })
      }
      return next
    })
  }

  const finish = async (skipPantry = false) => {
    setBusy(true)
    setError(null)
    try {
      // Step 1: create the household with the welcome-step fields.
      const hh = await api.createHousehold(session.user.id, {
        name: name.trim() || 'My Kitchen',
        members: 4,
        vegetarian,
        voting_enabled: voting,
        onboarding_complete: true,
      })
      // Step 2: bulk-replace the inventory with the picked items (or
      // empty if the user skipped the pantry).
      const items = skipPantry
        ? []
        : Object.entries(picks).map(([id, p]) => {
            const group = KITCHEN_GROUPS.find((g) => g.items.some((it) => it.id === id))
            const tpl = group?.items.find((it) => it.id === id)
            return {
              id,
              name: p.name || tpl?.name || id,  // p.name is the source of truth; tpl is fallback
              quantity: p.qty,
              unit: p.unit,
              category: tpl?.category ?? 'monthly',  // custom items default to monthly reorder
              group: group?.id,
            } as { id: string; name: string; quantity: number; unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs'; category: 'weekly' | 'monthly'; group?: string }
          })
      await api.bulkReplaceInventory(hh.id, items)
      onComplete(hh)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'Could not save. Try again.')
    } finally { setBusy(false) }
  }

  // ===========================================================================
  // Step renders
  // ===========================================================================
  if (currentStep === 'welcome') {
    return <div className="onboarding">
      <div className="onboarding-card onboarding-welcome">
        <span className="eyebrow"><Sparkles size={14} /> NAMASTE</span>
        <h1>Aapka swagat hai 🙏</h1>
        <p>Let's set up your kitchen in 5 quick steps. You'll pick what you actually have at home — atta, daal, masala, sabziyan, the works. No need to remember everything; you can edit it any time.</p>
        <label className="onboarding-field">
          <span>What should we call your kitchen?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathur Parivaar" autoFocus />
        </label>
        <label className="onboarding-row toggle">
          <span><b>Pure vegetarian household</b><small>No eggs or meat in suggestions</small></span>
          <input type="checkbox" checked={vegetarian} onChange={(e) => setVegetarian(e.target.checked)} />
        </label>
        <label className="onboarding-row toggle">
          <span><b>Enable family voting</b><small>Transparent tally on Today</small></span>
          <input type="checkbox" checked={voting} onChange={(e) => setVoting(e.target.checked)} />
        </label>
        {error && <p className="onboarding-error">{error}</p>}
        <div className="onboarding-actions">
          <button className="primary" disabled={busy} onClick={() => setStepIdx(stepIdx + 1)}>Chalo shuru karte hain <ChevronRight size={17} /></button>
          <button className="reset-button" disabled={busy} onClick={() => finish(true)}>Skip — use a starter kitchen</button>
        </div>
      </div>
    </div>
  }

  if (currentGroup) {
    const groupPicked = currentGroup.items.filter((it) => picks[it.id]).length
    const allPicked = groupPicked === currentGroup.items.length
    return <div className="onboarding">
      <div className="onboarding-card onboarding-group">
        <div className="onboarding-progress">
          <span>Step {stepIdx} of {steps.length - 1}</span>
          <div className="onboarding-progress-bar"><i style={{ width: `${(stepIdx / (steps.length - 1)) * 100}%` }} /></div>
        </div>
        <div className="onboarding-group-head">
          <span className="onboarding-emoji">{currentGroup.emoji}</span>
          <div>
            <h1>{currentGroup.label}</h1>
            {currentGroup.labelHi && <p className="onboarding-hindi">{currentGroup.labelHi}</p>}
          </div>
          <button className="reset-button onboarding-group-toggle-all" onClick={() => toggleGroup(currentGroup)}>{allPicked ? 'Uncheck all' : `Add all (${currentGroup.items.length})`}</button>
        </div>
        <p className="onboarding-group-help">Tap to add. After tapping, edit the quantity if you want a different amount. Items not in the list? Add your own below.</p>
        <div className="onboarding-grid">
          {currentGroup.items.map((it) => {
            const picked = !!picks[it.id]
            return <div key={it.id} className={`onboarding-item ${picked ? 'picked' : ''}`}>
              <label className="onboarding-item-row">
                <input type="checkbox" checked={picked} onChange={() => toggleItem(it)} />
                <span className="onboarding-item-name">{it.name}</span>
                <span className="onboarding-item-default">{it.defaultQty.toLocaleString()} {it.defaultUnit}</span>
              </label>
              {picked && (
                <div className="onboarding-item-edit">
                  <input type="number" min="0" value={picks[it.id].qty} onChange={(e) => updatePick(it.id, { qty: parseFloat(e.target.value) || 0 })} />
                  <select value={picks[it.id].unit} onChange={(e) => updatePick(it.id, { unit: e.target.value as any })}>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              )}
            </div>
          })}
          {/* Render any custom items the user has added in this group. Custom
              items are stored in the picks map with ids starting 'custom-'.
              They behave like template items: toggle off to remove, edit
              qty/unit inline. */}
          {Object.entries(picks)
            .filter(([id]) => id.startsWith('custom-'))
            .map(([id, p]) => {
              const picked = true  // custom items are always 'picked' by definition
              return <div key={id} className={`onboarding-item custom picked`}>
                <label className="onboarding-item-row">
                  <input type="checkbox" checked={picked} onChange={() => setPicks((prev) => { const next = { ...prev }; delete next[id]; return next })} />
                  <span className="onboarding-item-name">{p.name}</span>
                  <span className="onboarding-item-default" style={{ background: 'rgba(220,165,49,.15)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Custom</span>
                </label>
                <div className="onboarding-item-edit">
                  <input type="number" min="0" value={p.qty} onChange={(e) => updatePick(id, { qty: parseFloat(e.target.value) || 0 })} />
                  <select value={p.unit} onChange={(e) => updatePick(id, { unit: e.target.value as any })}>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>
            })}
        </div>

        {/* Add custom item form. The form is always visible at the bottom
            of each group step so the user can add anything missing from
            the template (e.g. "kokum", "kasuri methi", "tamarind paste"). */}
        <div className="onboarding-custom-row">
          {(() => {
            const draft = customDraft[currentGroup.id] ?? { name: '', qty: '500', unit: 'g' }
            const update = (patch: Partial<typeof draft>) => setCustomDraft((prev) => ({ ...prev, [currentGroup.id]: { ...draft, ...patch } }))
            return <>
              <span className="onboarding-custom-label">+ Add your own</span>
              <input
                placeholder={`e.g. Kasuri methi for ${currentGroup.label.toLowerCase()}`}
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addCustomItem(currentGroup)}
                className="onboarding-custom-name"
              />
              <input type="number" min="0" placeholder="qty" value={draft.qty} onChange={(e) => update({ qty: e.target.value })} className="onboarding-custom-qty" />
              <select value={draft.unit} onChange={(e) => update({ unit: e.target.value as any })} className="onboarding-custom-unit">
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
                <option value="pcs">pcs</option>
              </select>
              <button className="primary onboarding-custom-add" onClick={() => addCustomItem(currentGroup)} disabled={!draft.name.trim() || !parseFloat(draft.qty)}>Add</button>
            </>
          })()}
        </div>
        {error && <p className="onboarding-error">{error}</p>}
        <div className="onboarding-actions">
          {stepIdx > 0 && <button className="reset-button" disabled={busy} onClick={() => setStepIdx(stepIdx - 1)}>← Back</button>}
          {stepIdx < steps.length - 1
            ? <button className="primary" disabled={busy} onClick={() => setStepIdx(stepIdx + 1)}>{groupPicked > 0 ? `Continue with ${groupPicked} added` : 'Continue'} <ChevronRight size={17} /></button>
            : <button className="primary" disabled={busy} onClick={() => finish(false)}>Save and finish <ChevronRight size={17} /></button>
          }
          {groupPicked === 0 && stepIdx < steps.length - 1 && <button className="reset-button" disabled={busy} onClick={() => setStepIdx(stepIdx + 1)}>Skip this group</button>}
        </div>
      </div>
    </div>
  }

  if (currentStep === 'summary') {
    return <div className="onboarding">
      <div className="onboarding-card onboarding-summary">
        <div className="onboarding-progress">
          <span>Step {steps.length - 1} of {steps.length - 1}</span>
          <div className="onboarding-progress-bar"><i style={{ width: '100%' }} /></div>
        </div>
        <span className="eyebrow"><Check size={14} /> READY TO COOK</span>
        <h1>{totalPicks > 0 ? `Aapne ${totalPicks} cheezein chuni hain` : 'Empty kitchen — let\'s add things later'}</h1>
        {totalPicks > 0
          ? <p>These will be in your kitchen. We'll suggest meals based on what's actually there. You can edit any of this from the Kitchen tab.</p>
          : <p>You can add items from the Kitchen tab at any time.</p>
        }
        {totalPicks > 0 && (
          <details className="onboarding-summary-details">
            <summary>Review ({totalPicks} items)</summary>
            <ul>
              {Object.keys(picks).map((id) => {
                const tpl = KITCHEN_GROUPS.flatMap((g) => g.items).find((it) => it.id === id)
                if (!tpl) return null
                const p = picks[id]
                return <li key={id}><b>{tpl.name}</b><span>{p.qty.toLocaleString()} {p.unit}</span></li>
              })}
            </ul>
          </details>
        )}
        {error && <p className="onboarding-error">{error}</p>}
        <div className="onboarding-actions">
          <button className="reset-button" disabled={busy} onClick={() => setStepIdx(stepIdx - 1)}>← Back to pantry</button>
          <button className="primary" disabled={busy} onClick={() => finish(false)}>{busy ? 'Saving…' : 'Save and open my kitchen'} <ChevronRight size={17} /></button>
        </div>
      </div>
    </div>
  }

  return null
}

// =============================================================================
// DislikesSection — Phase 3 (Today tab)
// Inline "things you don't eat" editor. Lets the user add a new dislike
// with an optional slot, and remove existing ones. Mirrors the chat
// command: "no rajma for dinner" writes the same shape.
// =============================================================================
function DislikesSection({ dislikes, onRemove, onAdd }: {
  dislikes: Dislike[]
  onRemove: (index: number) => void
  onAdd: (name: string, slot: 'BREAKFAST' | 'LUNCH' | 'DINNER' | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [slot, setSlot] = useState<'BREAKFAST' | 'LUNCH' | 'DINNER' | ''>('')
  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed, slot === '' ? null : slot)
    setName('')
    setSlot('')
    setAdding(false)
  }
  return <section className="dislikes-section">
    <div className="page-heading">
      <span className="eyebrow"><X size={14} /> THINGS YOU DON'T EAT</span>
      <h2>Dislikes</h2>
      <p>Tagged dishes won't be suggested. Add a slot if the dislike only applies to a specific meal.</p>
    </div>
    <ul className="dislike-chips">
      {dislikes.map((d, i) => <li key={`${d.name}-${i}`} className="dislike-chip">
        <span className="dislike-name">{d.name}</span>
        {d.slot && <span className="dislike-slot-pill">{d.slot.toLowerCase()}</span>}
        <button onClick={() => onRemove(i)} aria-label={`Remove ${d.name}`}><X size={12} /></button>
      </li>)}
    </ul>
    {adding ? <div className="dislike-add-row">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setName('') } }} placeholder="e.g. rajma" />
      <select value={slot} onChange={(e) => setSlot(e.target.value as any)}>
        <option value="">any meal</option>
        <option value="BREAKFAST">breakfast only</option>
        <option value="LUNCH">lunch only</option>
        <option value="DINNER">dinner only</option>
      </select>
      <button className="primary mini" onClick={submit} disabled={!name.trim()}>Add</button>
      <button className="reset-button mini" onClick={() => { setAdding(false); setName('') }}>Cancel</button>
    </div> : <button className="dislike-add-btn" onClick={() => setAdding(true)}><Plus size={12} /> Add dislike</button>}
  </section>
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [household, setHousehold] = useState<api.Household | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [tab, setTab] = useState<Tab>('today')
  // Dynamic day/meal-of-day labels for the Today hero. Recomputed on every
  // render — cheap, and means a user opening the app at 6pm sees "Wednesday
  // DINNER" and at 7am sees "Wednesday BREAKFAST" without any state plumbing.
  const now = new Date()
  const weekday = now.toLocaleDateString('en-IN', { weekday: 'long' }).toUpperCase()
  const hour = now.getHours()
  const mealOfDay: 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER' = hour < 11 ? 'BREAKFAST' : hour < 16 ? 'LUNCH' : hour < 19 ? 'SNACKS' : 'DINNER'
  const todayLabel = `${weekday} ${mealOfDay}`
  const greeting = hour < 11 ? 'Subah ka kya banayein?' : hour < 16 ? 'Dopahar ka kya banayein?' : 'Shaam ka kya banayein?'
  const mealNoun = mealOfDay === 'BREAKFAST' ? "Today's breakfast" : mealOfDay === 'LUNCH' ? "Today's lunch" : mealOfDay === 'SNACKS' ? "Today's snacks" : "Tonight's dinner"
  const todayKey = now.toISOString().slice(0, 10)
  const [preferences, setPreferences] = useState<Preferences>(() => migratePreferences(load('kya-preferences', DEFAULT_PREFERENCES)))
  const [inventory, setInventory] = useState<InventoryItem[]>(() => load('kya-inventory', DEFAULT_INVENTORY))
  // Order list customisations (loaded fresh on each refresh of orderVersion).
  const [, setOrderVersion] = useState(0)
  const [customOrderItems, setCustomOrderItems] = useState<{ weekly: { id: string; name: string; quantity: number; unit: string }[]; monthly: { id: string; name: string; quantity: number; unit: string }[] }>({ weekly: [], monthly: [] })
  const [selected, setSelected] = useState<MealOption | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  // Dishes the user has toggled out of the currently-selected meal. Reset
  // when a new meal is chosen. Affects the confirmation: only non-excluded
  // dishes' ingredients are deducted from inventory and recorded in history.
  const [excludedDishes, setExcludedDishes] = useState<Set<string>>(new Set())
  const [showDishEditor, setShowDishEditor] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chat, setChat] = useState<ChatTurn[]>([
    { from: 'bot', text: 'Namaste! Apni bhasha mein bolo — "मैं शाकाहारी हूँ", "৫ টা suggestion দাও", ya "we are 6 people". Main settings update kar dunga.' },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLang, setChatLang] = useState('hi-IN')
  const [listening, setListening] = useState(false)
  const [srSupported, setSrSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [voting, setVoting] = useState<VotingState>(() => load('kya-voting', DEFAULT_VOTING))
  const [newVoterName, setNewVoterName] = useState('')
  const [activeVoter, setActiveVoter] = useState<string | null>(null)
  const [voterIndex, setVoterIndex] = useState<Record<string, string>>({})
  const [voters, setVoters] = useState<api.Voter[]>([])
  const [votesToday, setVotesToday] = useState<Record<string, string>>({})
  const [voterPreferences, setVoterPreferences] = useState<api.VoterMealPreference[]>([])
  const [mealHistory, setMealHistory] = useState<api.MealHistoryRow[]>([])
  // Day plan: 3 slots per day, each with an optional meal plan.
  const [mealPlansByDate, setMealPlansByDate] = useState<Record<string, api.MealPlan[]>>({})
  const [selectedSlot, setSelectedSlot] = useState<api.MealSlot>('DINNER')
  // First-time-user tutorial. Triggers when the user has completed onboarding
  // but hasn't confirmed a meal yet and hasn't dismissed the tour. Persisted
  // in localStorage so a refresh doesn't restart the tutorial. Three short
  // steps: pick a meal, confirm to update inventory, try the chat.
  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const done = localStorage.getItem('kya-tutorial-done')
      if (done) return null
      return 0
    } catch { return null }
  })
  // Pending join request from a shared ?join=... link. Set on mount if
  // the URL has a join code; cleared once the user joins or dismisses.
  const [pendingJoin, setPendingJoin] = useState<{ code: string; household?: { id: string; name: string } } | null>(null)
  const [joinBusy, setJoinBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setBootstrapping(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Detect a ?join=... share link on mount. If the user is already signed
  // in, look up the household immediately and surface the join screen. If
  // not, remember the code so we can show it after they sign in.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')
    if (!code) return
    if (!session?.user?.id) return
    let cancelled = false
    api.fetchHouseholdByJoinCode(code).then((h) => {
      if (cancelled) return
      if (h) setPendingJoin({ code, household: h })
      else setPendingJoin({ code })
    }).catch(() => { if (!cancelled) setPendingJoin({ code }) })
    return () => { cancelled = true }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const hh = await api.fetchHousehold(session.user.id)
        if (cancelled) return
        if (!hh) { setTab('onboarding'); return }
        setHousehold(hh)
        // Lazy-generate a join code if this household doesn't have one yet.
        // The SQL migration only backfills on the existing household; new
        // households created via onboarding need the code generated in JS.
        if (!hh.join_code) {
          api.generateAndSetJoinCode(hh).then((updated) => setHousehold(updated)).catch((e) => console.warn('Could not generate join code', e))
        }
        const [inv, voters, votes, history, overrides, plans, voterPrefs] = await Promise.all([
          api.fetchInventory(hh.id),
          api.fetchVoters(hh.id),
          api.fetchVotesToday(hh.id),
          api.fetchMealHistory(hh.id, 7),
          api.fetchOrderOverrides(hh.id),
          api.fetchMealPlansForDay(hh.id, new Date().toISOString().slice(0, 10)),
          api.fetchHouseholdPreferences(hh.id),
        ])
        if (cancelled) return
        setInventory(inv)
        setMealHistory(history)
        setVoterPreferences(voterPrefs)
        setVoters(voters)
        setCustomOrderItems({
          weekly: overrides.filter((o) => o.slot === 'weekly' && o.action === 'add').map((o) => ({ id: o.id, name: o.custom_name ?? '', quantity: o.custom_quantity ?? 0, unit: o.custom_unit ?? 'g' })),
          monthly: overrides.filter((o) => o.slot === 'monthly' && o.action === 'add').map((o) => ({ id: o.id, name: o.custom_name ?? '', quantity: o.custom_quantity ?? 0, unit: o.custom_unit ?? 'g' })),
        })
        setMealPlansByDate({ [new Date().toISOString().slice(0, 10)]: plans })
        const idx: Record<string, string> = {}
        voters.forEach((v) => { idx[v.name] = v.id })
        setVoterIndex(idx)
        const vmap: Record<string, string> = {}
        votes.forEach((v) => { vmap[v.voter_id] = v.meal_id })
        setVotesToday(vmap)
        setPreferences((p) => ({ ...p, familyName: hh.name, members: hh.members, vegetarian: hh.vegetarian, dislikes: hh.dislikes ?? p.dislikes }))
        setVoting((v) => ({ ...v, enabled: hh.voting_enabled }))
      } catch (e) { console.error('Bootstrap failed:', e) }
    })()
    return () => { cancelled = true }
  }, [session?.user?.id])

  useEffect(() => localStorage.setItem('kya-preferences', JSON.stringify(preferences)), [preferences])
  useEffect(() => localStorage.setItem('kya-inventory', JSON.stringify(inventory)), [inventory])
  useEffect(() => localStorage.setItem('kya-voting', JSON.stringify(voting)), [voting])
  useEffect(() => setSrSupported(SR() !== null), [])

  useEffect(() => {
    if (!household) return
    if (preferences.familyName === household.name && preferences.members === household.members && preferences.vegetarian === household.vegetarian && voting.enabled === household.voting_enabled && JSON.stringify(preferences.dislikes) === JSON.stringify(household.dislikes ?? [])) return
    const t = setTimeout(async () => {
      try {
        const updated = await api.updateHousehold(household.id, { name: preferences.familyName, members: preferences.members, vegetarian: preferences.vegetarian, voting_enabled: voting.enabled, dislikes: preferences.dislikes })
        setHousehold(updated)
      } catch (e) { console.error('Household sync failed:', e) }
    }, 800)
    return () => clearTimeout(t)
  }, [preferences.familyName, preferences.members, preferences.vegetarian, voting.enabled, preferences.dislikes, household])

  const mealOptions = useMemo(() => recommendMeals(preferences, inventory), [preferences, inventory])
  const orders = useMemo(() => getOrderSuggestions(inventory), [inventory])
  const lowStock = orders.weekly.length + orders.monthly.length
  const voteResult: PollResult = useMemo(() => {
    const voters = Object.entries(voterIndex).map(([name, id]) => ({ name, code: id.slice(0, 5).toUpperCase() }))
    const poll: Poll = { id: 'live', voters, votes: Object.fromEntries(Object.entries(votesToday).map(([id, mealId]) => [id, { mealId }])) }
    return getResults(poll)
  }, [voterIndex, votesToday])

  const chooseMeal = (meal: MealOption) => {
    setSelected(meal)
    setConfirmed(null)
    setExcludedDishes(new Set())  // reset exclusions on a new meal
    // Optimistically upsert the plan for the current slot so the slot chip
    // flips to 'Planned' immediately. The real upsert happens in confirm().
    if (household) {
      api.upsertMealPlan(household.id, todayKey, selectedSlot, meal.id).then((plan) => {
        setMealPlansByDate((prev) => ({ ...prev, [todayKey]: [...(prev[todayKey] ?? []).filter((p) => p.slot !== selectedSlot), plan] }))
      }).catch((e) => console.error('Plan upsert failed:', e))
    }
  }
  const confirm = async () => {
    if (!selected) return
    const effectiveDishes = selected.dishes.filter((d) => !excludedDishes.has(d.id))
    if (effectiveDishes.length === 0) {
      alert('You\'ve excluded every dish from this meal. Add at least one back before confirming.')
      return
    }
    const next = confirmMeal(inventory, effectiveDishes.flatMap((dish) => dish.ingredients))
    setInventory(next)
    setConfirmed(selected.id)
    // First confirmed meal → tutorial done.
    if (tutorialStep !== null) {
      localStorage.setItem('kya-tutorial-done', '1')
      setTutorialStep(null)
    }
    if (household) {
      try {
        await Promise.all(next.map((i) => api.updateInventoryItem(i.id, i.quantity)))
        await api.recordMeal(household.id, selected.id, effectiveDishes)
        // Mark the per-slot plan as confirmed.
        await api.confirmMealPlan(household.id, todayKey, selectedSlot)
        setMealPlansByDate((prev) => {
          const existing = prev[todayKey] ?? []
          return { ...prev, [todayKey]: existing.map((p) => p.slot === selectedSlot ? { ...p, confirmed_at: new Date().toISOString() } : p) }
        })
        // Refresh the history so the new meal shows up immediately.
        api.fetchMealHistory(household.id, 7).then(setMealHistory).catch(() => {})
      } catch (e) { console.error('Confirm sync failed:', e) }
    }
  }
  const resetData = async () => {
    setPreferences(DEFAULT_PREFERENCES)
    setInventory(DEFAULT_INVENTORY)
    setSelected(null)
    setConfirmed(null)
    setVoting(DEFAULT_VOTING)
    setVoterIndex({})
    setVotesToday({})
  }
  const signOut = async () => { await supabase.auth.signOut() }

  const applyIntent = (intent: ChatIntent): string => {
    if (intent.kind === 'preference') {
      if (intent.action === 'set-vegetarian') {
        setPreferences((p) => ({ ...p, vegetarian: intent.value }))
        return intent.value ? 'Done. Pure vegetarian household set.' : 'Samajh gaya. Non-veg bhi dikhaunga.'
      }
      if (intent.action === 'set-suggestions') {
        setPreferences((p) => ({ ...p, suggestionCount: intent.value }))
        return `Ab ${intent.value} options dikhaunga.`
      }
      if (intent.action === 'set-dishes') {
        setPreferences((p) => ({ ...p, dishesPerMeal: intent.value }))
        return `Har meal mein ab ${intent.value} dishes.`
      }
      if (intent.action === 'set-members') {
        setPreferences((p) => ({ ...p, members: intent.value }))
        return `Family size ${intent.value} members. Quantities update ho jayengi.`
      }
    }
    if (intent.kind === 'feed') {
      if (intent.dislike) {
        // Dedupe by name (case-insensitive): if the same dish is already
        // disliked (with or without a slot), update the slot rather than
        // adding a duplicate. The newer entry wins.
        const target = intent.dislike.trim().toLowerCase()
        const newSlot = intent.dislikeSlot ?? null
        setPreferences((p) => {
          const withoutDup = p.dislikes.filter((d) => d.name.trim().toLowerCase() !== target)
          return { ...p, dislikes: [...withoutDup, { name: intent.dislike!, slot: newSlot }] }
        })
        const slotSuffix = intent.dislikeSlot ? ` for ${intent.dislikeSlot.toLowerCase()}` : ''
        return `Theek hai, ${intent.dislike}${slotSuffix} kabhi suggest nahi karunga.`
      }
      if (intent.like) {
        return `Accha, ${intent.like} pasand hai. Note kar liya.`
      }
    }
    // F3 — chat-driven inventory updates. Match the item name against
    // existing inventory (substring), then either add or subtract the
    // quantity. If the item doesn't exist, fall through to "add custom".
    if (intent.kind === 'inventory' && household) {
      const lc = intent.itemName.toLowerCase()
      const existing = inventory.find((i) => i.name.toLowerCase().includes(lc) || lc.includes(i.name.toLowerCase()))
      const delta = intent.action === 'add' ? intent.quantity : -intent.quantity
      if (existing) {
        const newQty = Math.max(0, existing.quantity + delta)
        const updated = inventory.map((i) => i.id === existing.id ? { ...i, quantity: newQty } : i)
        setInventory(updated)
        api.updateInventoryItem(existing.id, newQty).catch((e) => console.error('Inventory update failed:', e))
        return `${intent.action === 'add' ? 'Added' : 'Used'} ${intent.quantity} ${intent.unit} of ${existing.name}. Now ${newQty} ${existing.unit} in stock.`
      } else if (intent.action === 'add') {
        // No match — create a custom item.
        api.addCustomInventoryItem(household.id, { name: intent.itemName.charAt(0).toUpperCase() + intent.itemName.slice(1), quantity: intent.quantity, unit: intent.unit, category: 'weekly' }).then(({ id }) => {
          setInventory([...inventory, { id, name: intent.itemName, quantity: intent.quantity, unit: intent.unit, category: 'weekly', reorderAt: Math.max(1, Math.floor(intent.quantity * 0.5)), targetStock: intent.quantity, custom: true } as any])
        }).catch((e) => console.error('Add custom item failed:', e))
        return `Added ${intent.quantity} ${intent.unit} of new item "${intent.itemName}" to your kitchen.`
      } else {
        return `I don't see ${intent.itemName} in your kitchen. Try adding it first, or use the kitchen tab.`
      }
    }
    // F2/F4 — plan a slot. Find the dish in the meal options, persist the
    // plan, switch the active slot to whatever the user asked for.
    if (intent.kind === 'plan' && household) {
      const lc = intent.dishName.toLowerCase()
      // Build a 1-meal recommendation so we can match against dish names.
      const recs = recommendMeals({ suggestionCount: 6, dishesPerMeal: 4, vegetarian: preferences.vegetarian }, inventory)
      const matchMeal = recs.find((m) => m.dishes.some((d) => d.name.toLowerCase().includes(lc))) ?? recs[0]
      if (!matchMeal) return `Couldn't build a meal with ${intent.dishName}. Try a different dish name.`
      const matchedDish = matchMeal.dishes.find((d) => d.name.toLowerCase().includes(lc)) ?? matchMeal.dishes[0]
      api.upsertMealPlan(household.id, todayKey, intent.slot, matchMeal.id).then((plan) => {
        setMealPlansByDate((prev) => ({ ...prev, [todayKey]: [...(prev[todayKey] ?? []).filter((p) => p.slot !== intent.slot), plan] }))
      }).catch((e) => console.error('Plan upsert failed:', e))
      setSelectedSlot(intent.slot)
      return `${intent.slot.charAt(0) + intent.slot.slice(1).toLowerCase()} plan set: ${matchedDish.name}${intent.mood ? ` (${intent.mood})` : ''}. Tap the chip to see suggestions.`
    }
    return intent.kind === 'unknown' ? intent.reply : 'Done.'
  }

  const submitChat = (raw?: string) => {
    const text = (typeof raw === 'string' ? raw : chatInput).trim()
    if (!text) return
    const intent = parseCommand(text)
    const reply = applyIntent(intent)
    setChat((c) => [...c, { from: 'user', text, intent }, { from: 'bot', text: reply }])
    setChatInput('')
    speak(reply, chatLang)
  }

  const handleSubmitClick = () => submitChat()

  const startListening = () => {
    const Ctor = SR()
    if (!Ctor) { setSrSupported(false); return }
    const r = new Ctor()
    r.lang = chatLang
    r.interimResults = true
    r.continuous = false
    r.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results).map((res) => res[0].transcript).join('')
      setChatInput(transcript)
      if (event.results[event.results.length - 1].isFinal) {
        setListening(false)
        submitChat(transcript)
      }
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    r.start()
    recognitionRef.current = r
    setListening(true)
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  const addVoterClick = async () => {
    const name = newVoterName.trim()
    if (!name || !household) return
    const code = generateCode()
    try {
      const v = await api.addVoterRow(household.id, name, code)
      setVoterIndex((idx) => ({ ...idx, [v.name]: v.id }))
      setNewVoterName('')
    } catch (e) { console.error('Add voter failed:', e) }
  }

  const removeVoter = async (id: string) => {
    try { await api.removeVoterRow(id) } catch (e) { console.error(e) }
    setVoterIndex((idx) => {
      const copy = { ...idx }
      Object.keys(copy).forEach((k) => { if (copy[k] === id) delete copy[k] })
      return copy
    })
    setVotesToday((m) => { const c = { ...m }; delete c[id]; return c })
  }

  const castVoteFor = async (voterId: string, mealId: string) => {
    if (!household) return
    setVotesToday((m) => ({ ...m, [voterId]: mealId }))
    try { await api.upsertVote(household.id, voterId, mealId) } catch (e) { console.error(e) }
  }

  const voteShareText = (name: string) => {
    const options = mealOptions.map((m, i) => `${i + 1}. ${m.title} (${m.dishes.map((d) => d.name).join(' + ')})`).join('\n')
    return `🍛 Aaj dinner vote karo!\n\nOpen: ${SUPABASE_URL.slice(8)}/?household=${household?.id ?? ''}\nAapka code: ${name}\n\nOptions:\n${options}`
  }

  const shareOnWhatsApp = (text: string) => window.open(buildWhatsAppShareUrl(text), '_blank', 'noopener')

  const groceryListText = (label: string, items: { name: string; quantity: number; unit: string }[]) =>
    `🛒 ${preferences.familyName} — ${label}\n\n${items.map((i) => `• ${i.name} — ${i.quantity.toLocaleString()} ${i.unit}`).join('\n')}\n\nShared from Kya Banayein?`

  if (bootstrapping) return <div className="auth-screen"><div className="auth-card"><span className="brand-mark"><UtensilsCrossed size={28} /></span><h1>Kya Banayein?</h1><p>Loading…</p></div></div>
  if (!session) return <SignIn />
  if (pendingJoin) return <JoinScreen
    code={pendingJoin.code}
    household={pendingJoin.household}
    busy={joinBusy}
    onCancel={() => { setPendingJoin(null); window.history.replaceState({}, '', window.location.pathname) }}
    onJoin={async (voterName) => {
      if (!pendingJoin.household) return
      setJoinBusy(true)
      try {
        await api.addVoterRow(pendingJoin.household.id, voterName, generateCode())
        // Strip the ?join= param from the URL so reload doesn't re-trigger the screen.
        window.history.replaceState({}, '', window.location.pathname)
        setPendingJoin(null)
        alert(`You're now a voter in ${pendingJoin.household.name}. Open the app's Today tab on your device — but voting requires the owner to be on the same screen for now. A proper multi-device flow is coming next.`)
      } catch (e) {
        console.error('Join failed:', e)
        alert('Could not join. The link may be expired or the household may have been deleted.')
      } finally { setJoinBusy(false) }
    }}
  />
  if (!household) return <KitchenOnboarding session={session} onComplete={(hh) => { setHousehold(hh); setTab('today') }} />

  const voterList = Object.entries(voterIndex).map(([name, id]) => ({ name, id, code: id.slice(0, 5).toUpperCase() }))

  return <div className="app-shell">
    <header>
      <button className="brand" onClick={() => setTab('today')}>
        <span className="brand-mark"><UtensilsCrossed size={22} /></span>
        <span><b>Kya Banayein?</b><small>{session.user.email}</small></span>
      </button>
      <button className="family-pill" onClick={() => setTab('household')}><Users size={17} /><span>{preferences.familyName}</span><ChevronRight size={16} /></button>
      <button className="signout-pill" onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button>
    </header>

    <main>
      {tab === 'today' && <>
        <section className="hero-copy">
          <div><span className="eyebrow"><Sparkles size={14} /> {todayLabel}</span><h1>{greeting}</h1><p>Plan breakfast, lunch, and dinner for today. Tap a meal to choose it, or use the chat to set preferences.</p></div>
          <div className="meal-controls">
            <label><span>Options to show</span><Counter value={preferences.suggestionCount} setValue={(suggestionCount) => setPreferences({ ...preferences, suggestionCount })} /></label>
            <label><span>Dishes per meal</span><Counter value={preferences.dishesPerMeal} setValue={(dishesPerMeal) => setPreferences({ ...preferences, dishesPerMeal })} /></label>
          </div>
        </section>

        <div className="slot-selector">
          {(['BREAKFAST', 'LUNCH', 'DINNER'] as const).map((s) => {
            const plan = mealPlansByDate[todayKey]?.find((p) => p.slot === s)
            return <button key={s} className={`slot-chip ${selectedSlot === s ? 'active' : ''} ${plan?.meal_id ? 'has-plan' : ''} ${plan?.confirmed_at ? 'confirmed' : ''}`} onClick={() => { setSelectedSlot(s); setSelected(null) }}>
              <span className="slot-label">{s === 'BREAKFAST' ? 'Breakfast' : s === 'LUNCH' ? 'Lunch' : 'Dinner'}</span>
              {plan?.meal_id && <span className="slot-tag">Planned</span>}
              {plan?.confirmed_at && <span className="slot-tag done">Done</span>}
            </button>
          })}
        </div>

        {voting.enabled && <section className="vote-panel">
          <div className="vote-head">
            <div><span className="eyebrow"><Vote size={14} /> FAMILY VOTE</span><h2>Sab ki pasand, transparent</h2><p>Add the people at home, share a link each, and watch the tally update live.</p></div>
            <div className="vote-summary">
              <div><b>{voteResult.castCount}</b><small>voted</small></div>
              <div><b>{voteResult.totalVoters - voteResult.castCount}</b><small>pending</small></div>
              <div><b>{voteResult.totalVoters}</b><small>voters</small></div>
            </div>
          </div>
          <div className="voter-chips">
            {voterList.length === 0 && <span className="voter-empty">Add at least one family member to start voting.</span>}
            {voterList.map((voter) => {
              const mealId = votesToday[voter.id]
              return <div key={voter.id} className={`voter-chip ${mealId ? 'voted' : 'pending'}`}>
                <div><b>{voter.name}</b><small>{mealId ? `picked ${mealOptions.find((m) => m.id === mealId)?.title ?? mealId}` : 'waiting…'}</small></div>
                <div className="voter-actions">
                  <button onClick={() => shareOnWhatsApp(voteShareText(voter.name))} aria-label="Share link"><Share2 size={14} /></button>
                  <button onClick={() => setActiveVoter(voter.id)} aria-label="Vote"><Vote size={14} /></button>
                  <button onClick={() => removeVoter(voter.id)} aria-label="Remove"><X size={14} /></button>
                </div>
                <code>{voter.code}</code>
              </div>
            })}
          </div>
          <div className="voter-add">
            <input value={newVoterName} onChange={(e) => setNewVoterName(e.target.value)} placeholder="Add a family member (e.g. Diya)" onKeyDown={(e) => e.key === 'Enter' && addVoterClick()} />
            <button onClick={addVoterClick} className="primary mini"><Plus size={16} /> Add</button>
            {voterList.length > 0 && <button onClick={() => shareOnWhatsApp(voteShareText(voterList[0].name))} className="secondary mini"><Share2 size={16} /> Share</button>}
          </div>
          {activeVoter && <div className="voter-choices">
            <div className="voter-choices-head">
              <span><b>Pick for {voterList.find((v) => v.id === activeVoter)?.name}</b><small>Tap to record the vote</small></span>
              <button onClick={() => setActiveVoter(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="voter-choices-list">
              {mealOptions.map((m, i) => {
                const count = voteResult.tallies[m.id] ?? 0
                return <button key={m.id} className="voter-choice" onClick={() => { castVoteFor(activeVoter, m.id); setActiveVoter(null) }}>
                  <span className="vote-num">0{i + 1}</span>
                  <span><b>{m.title}</b><small>{m.dishes.map((d) => d.name).join(' + ')}</small></span>
                  <strong>{count}</strong>
                </button>
              })}
            </div>
          </div>}
          {voteResult.castCount > 0 && <div className="vote-tally">
            <div className="vote-tally-head">
              <span><b>Live tally</b><small>Transparent — everyone's vote is visible</small></span>
              <button onClick={() => setVoting((v) => ({ ...v, shareAll: !v.shareAll }))} className="reset-button mini">{voting.shareAll ? <><EyeOff size={14} /> Hide picks</> : <><Eye size={14} /> Show picks</>}</button>
            </div>
            <ul>
              {mealOptions.map((m, i) => {
                const count = voteResult.tallies[m.id] ?? 0
                const pct = voteResult.castCount ? Math.round((count / voteResult.castCount) * 100) : 0
                const names = voting.shareAll ? voteResult.perVoter.filter((pv) => pv.mealId === m.id).map((pv) => pv.name) : []
                return <li key={m.id}>
                  <span className="vote-num">0{i + 1}</span>
                  <div className="vote-bar"><i style={{ width: `${pct}%` }} /><span><b>{m.title}</b><small>{names.length ? names.join(', ') : 'no votes yet'}</small></span></div>
                  <strong>{count}</strong>
                </li>
              })}
            </ul>
            {voteResult.winner && <div className="vote-winner"><Check size={18} /><span><small>Leading meal</small><b>{mealOptions.find((m) => m.id === voteResult.winner)?.title}</b></span></div>}
          </div>}
        </section>}

        <section className="meal-grid">
          {mealOptions.map((meal, index) => {
            const count = voteResult.tallies[meal.id] ?? 0
            return <article className={`meal-card ${selected?.id === meal.id ? 'selected' : ''} ${voteResult.winner === meal.id ? 'winner' : ''}`} key={meal.id}>
              <button className="meal-select" onClick={() => chooseMeal(meal)} aria-label={`Choose ${meal.title}`}>
                <div className="meal-art" style={{ '--meal-color': meal.dishes[0].color } as React.CSSProperties}>
                  <span className="option-index">0{index + 1}</span>
                  <div className="plate"><div className="food-shape" /><div className="garnish">✦</div></div>
                  {meal.match >= 80 && <span className="match-badge"><Check size={14} /> {meal.match}% pantry match</span>}
                  {voting.enabled && count > 0 && <span className="vote-badge"><Vote size={13} /> {count}</span>}
                </div>
                <div className="meal-body">
                  <div className="meal-meta"><span><Clock3 size={15} /> {meal.totalTime} min</span><span>{meal.dishes.length} dishes</span></div>
                  <h2>{meal.title}</h2><p>{meal.note}</p>
                  <ul>{meal.dishes.map((dish) => <li key={`${meal.id}-${dish.id}`}><span className="dish-dot" style={{ background: dish.color }} /> <span><b>{dish.name}</b><small>{dish.description}</small></span></li>)}</ul>
                  <span className="choose-cta">{selected?.id === meal.id ? <><Check size={17} /> Selected</> : <>Choose this meal <ChevronRight size={17} /></>}</span>
                </div>
              </button>
            </article>
          })}
        </section>

        {preferences.dislikes.length > 0 && <DislikesSection
          dislikes={preferences.dislikes}
          onRemove={(i) => setPreferences((p) => ({ ...p, dislikes: p.dislikes.filter((_, j) => j !== i) }))}
          onAdd={(name, slot) => setPreferences((p) => {
            const target = name.trim().toLowerCase()
            const withoutDup = p.dislikes.filter((d) => d.name.trim().toLowerCase() !== target)
            return { ...p, dislikes: [...withoutDup, { name: name.trim(), slot: slot ?? null }] }
          })}
        />}

        {mealHistory.length > 0 && <section className="history-section">
          <div className="page-heading"><span className="eyebrow"><Clock3 size={14} /> THIS WEEK</span><h2>Recently cooked</h2><p>Last {mealHistory.length} meal{mealHistory.length === 1 ? '' : 's'} you've confirmed. Use this to avoid repeats.</p></div>
          <ul className="history-list">
            {mealHistory.map((h, i) => {
              const date = new Date(h.confirmed_at)
              const dishNames = Array.isArray(h.dishes) ? h.dishes.map((d) => d.name).join(' + ') : 'meal'
              return <li key={`${h.confirmed_at}-${i}`} className="history-row">
                <span className="history-date">{date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="history-meal">{dishNames}</span>
                <span className="history-time">{date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
              </li>
            })}
          </ul>
        </section>}

        {selected && <section className="confirmation-bar">
          <div className="confirmation-main">
            <span className="mini-plate"><UtensilsCrossed size={20} /></span>
            <div className="confirmation-detail">
              <small>{mealNoun}</small>
              <b>{selected.dishes.filter((d) => !excludedDishes.has(d.id)).map((dish) => dish.name).join(' + ') || '(no dishes — pick at least one)'}</b>
              <small className="confirmation-edit-hint"><button className="link-button" onClick={() => setShowDishEditor((v) => !v)}>{showDishEditor ? 'Hide' : 'Edit'} dishes ({selected.dishes.length})</button></small>
            </div>
          </div>
          {showDishEditor && <div className="dish-editor">
            {selected.dishes.map((d) => {
              const excluded = excludedDishes.has(d.id)
              return <label key={d.id} className={`dish-toggle ${excluded ? 'excluded' : ''}`}>
                <input type="checkbox" checked={!excluded} onChange={(e) => {
                  setExcludedDishes((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.delete(d.id)
                    else next.add(d.id)
                    return next
                  })
                }} />
                <span><b>{d.name}</b><small>{d.description}</small></span>
                {excluded && <em>won't be cooked</em>}
              </label>
            })}
          </div>}
          {confirmed === selected.id ? <button className="confirmed"><Check size={18} /> Inventory updated</button> : <button className="primary" onClick={confirm} disabled={selected.dishes.filter((d) => !excludedDishes.has(d.id)).length === 0}>Confirm meal & use stock <ChevronRight size={18} /></button>}
        </section>}
      </>}

      {tab === 'inventory' && <section className="page-section">
        <div className="page-heading"><span className="eyebrow"><Package size={14} /> YOUR KITCHEN</span><h1>Inventory</h1><p>Adjust what is actually available. Meal suggestions update immediately.</p></div>
        <div className="inventory-grid">{inventory.map((item) => {
          const percent = Math.min(100, Math.round((item.quantity / item.targetStock) * 100))
          const isCustom = (item as any).custom === true
          return <article className={`stock-card ${isCustom ? 'custom' : ''}`} key={item.id}>
            <div><span className={`stock-icon ${percent <= 25 ? 'danger' : ''}`}>{item.name.slice(0, 1)}</span><span><b>{item.name}</b><small>{isCustom ? 'Custom' : item.category === 'weekly' ? 'Fresh · weekly' : 'Staple · monthly'}</small></span></div>
            <strong>{item.quantity.toLocaleString()} <small>{item.unit}</small></strong>
            <div className="stock-track"><i style={{ width: `${percent}%` }} /></div>
            <div className="stock-actions">
              <button onClick={async () => { const next = inventory.map((x) => x.id === item.id ? { ...x, quantity: Math.max(0, x.quantity - (x.unit === 'pcs' ? 1 : 100)) } : x); setInventory(next); const it = next.find((x) => x.id === item.id); if (it) { try { await api.updateInventoryItem(it.id, it.quantity) } catch (e) { console.error(e) } } }}><Minus size={16} /></button>
              <span>{percent}% stocked</span>
              <button onClick={async () => { const next = inventory.map((x) => x.id === item.id ? { ...x, quantity: Math.min(x.targetStock, x.quantity + (x.unit === 'pcs' ? 1 : 100)) } : x); setInventory(next); const it = next.find((x) => x.id === item.id); if (it) { try { await api.updateInventoryItem(it.id, it.quantity) } catch (e) { console.error(e) } } }}><Plus size={16} /></button>
              {isCustom && <button className="remove-item" aria-label={`Remove ${item.name}`} onClick={async () => { if (!window.confirm(`Remove ${item.name} from your kitchen?`)) return; try { await api.deleteInventoryItem(item.id); setInventory(inventory.filter((x) => x.id !== item.id)) } catch (e) { console.error(e) } }}><X size={14} /></button>}
            </div>
          </article>
        })}</div>
        <CustomInventoryAdder householdId={household?.id ?? null} onAdd={(item) => setInventory([...inventory, item])} />
      </section>}

      {tab === 'orders' && <section className="page-section">
        <div className="page-heading"><span className="eyebrow"><ShoppingBasket size={14} /> SMART REORDER</span><h1>What to buy</h1><p>Fresh food weekly. Pantry staples only when they run low. Click <X size={12} style={{ verticalAlign: 'middle' }} /> on any item to remove it, or add your own.</p></div>
        <div className="order-columns">
          {household ? <OrderListEditor
            title="Buy this week"
            subtitle="Fresh produce and dairy"
            baseItems={orders.weekly}
            customItems={customOrderItems.weekly}
            slot="weekly"
            householdId={household.id}
            onChange={() => setOrderVersion((v) => v + 1)}
            shareText={groceryListText('Weekly fresh food', [...orders.weekly, ...customOrderItems.weekly])}
            onShare={shareOnWhatsApp}
            empty="Fresh stock looks good."
          /> : <OrderList title="Buy this week" subtitle="Fresh produce and dairy" items={orders.weekly} empty="Fresh stock looks good." shareText={groceryListText('Weekly fresh food', orders.weekly)} onShare={shareOnWhatsApp} />}
          {household ? <OrderListEditor
            title="Monthly pantry order"
            subtitle="Staples below their threshold"
            baseItems={orders.monthly}
            customItems={customOrderItems.monthly}
            slot="monthly"
            householdId={household.id}
            onChange={() => setOrderVersion((v) => v + 1)}
            shareText={groceryListText('Monthly pantry', [...orders.monthly, ...customOrderItems.monthly])}
            onShare={shareOnWhatsApp}
            empty="Staples look good for the month."
          /> : <OrderList title="Monthly pantry order" subtitle="Staples below their threshold" items={orders.monthly} empty="Staples look good for the month." shareText={groceryListText('Monthly pantry', orders.monthly)} onShare={shareOnWhatsApp} />}
        </div>
        <div className="order-note"><Sparkles size={20} /><div><b>How this works</b><p>Confirming a meal deducts its ingredients. The order list uses your stock thresholds—not AI guesses—so quantities remain predictable. Your edits to this list are remembered.</p></div></div>
      </section>}

      {tab === 'family' && household && <FamilyPage
        voters={voters}
        preferences={preferences}
        voterPreferences={voterPreferences}
        busy={false}
        onAddVoter={async (name) => {
          try {
            const v = await api.addVoterRow(household.id, name, generateCode())
            setVoters((prev) => [...prev, v])
            setVoterIndex((prev) => ({ ...prev, [v.name]: v.id }))
          } catch (e) { console.error(e); alert('Could not add member.') }
        }}
        onRemoveVoter={async (id) => {
          try {
            await api.removeVoterRow(id)
            setVoters((prev) => prev.filter((v) => v.id !== id))
            setVoterIndex((prev) => {
              const next: Record<string, string> = {}
              for (const k of Object.keys(prev)) {
                if (prev[k] !== id) next[k] = prev[k]
              }
              return next
            })
          } catch (e) { console.error(e); alert('Could not remove member.') }
        }}
        onAddPreference={async (voterId, slot, mealName) => {
          try {
            const pref = await api.addVoterPreference({ voter_id: voterId, slot, day_of_week: null, meal_name: mealName, mood: null, strength: 1 })
            setVoterPreferences((prev) => { return [...prev, pref] })
          } catch (e) { console.error(e); alert('Could not add preference.') }
        }}
        onRemovePreference={async (id) => {
          try {
            await api.deleteVoterPreference(id)
            setVoterPreferences((prev) => { return prev.filter((p) => p.id !== id) })
          } catch (e) { console.error(e); alert('Could not remove preference.') }
        }}
      />}

      {tab === 'household' && <section className="page-section settings-page">
        <div className="page-heading"><span className="eyebrow"><Settings2 size={14} /> HOUSEHOLD RULES</span><h1>Your kitchen, your rules</h1><p>Set this once. Every meal suggestion will respect it.</p></div>
        <div className="settings-card">
          <label className="text-field"><span>Household name</span><input value={preferences.familyName} onChange={(e) => setPreferences({ ...preferences, familyName: e.target.value })} /></label>
          <div className="setting-row"><span><b>Family members</b><small>Used to size ingredient quantities</small></span><Counter value={preferences.members} setValue={(members) => setPreferences({ ...preferences, members })} max={12} /></div>
          <div className="setting-row"><span><b>Meal suggestions</b><small>How many options the family sees</small></span><Counter value={preferences.suggestionCount} setValue={(suggestionCount) => setPreferences({ ...preferences, suggestionCount })} /></div>
          <div className="setting-row"><span><b>Dishes per meal</b><small>Main, side, bread or rice</small></span><Counter value={preferences.dishesPerMeal} setValue={(dishesPerMeal) => setPreferences({ ...preferences, dishesPerMeal })} /></div>
          <label className="setting-row toggle-row"><span><b>Pure vegetarian household</b><small>Never suggest eggs or meat</small></span><input type="checkbox" checked={preferences.vegetarian} onChange={(e) => setPreferences({ ...preferences, vegetarian: e.target.checked })} /></label>
          <label className="setting-row toggle-row"><span><b>Family voting</b><small>Let everyone pick a meal — transparent tally</small></span><input type="checkbox" checked={voting.enabled} onChange={(e) => setVoting((v) => ({ ...v, enabled: e.target.checked }))} /></label>
          {preferences.dislikes.length > 0 && <div className="setting-row"><span><b>Never suggest</b><small>Set by you or the assistant</small></span><div className="dislike-tags">{preferences.dislikes.map((d, i) => <span className="tag" key={`${d.name}-${i}`}>{d.name}{d.slot && <em className="dislike-slot-pill"> · {d.slot.toLowerCase()}</em>}<button onClick={() => setPreferences((p) => ({ ...p, dislikes: p.dislikes.filter((_, j) => j !== i) }))} aria-label={`Remove ${d.name}`}><X size={12} /></button></span>)}</div></div>}
          <button className="reset-button" onClick={resetData}><RotateCcw size={17} /> Reset to demo data</button>
          <button className="reset-button" style={{ marginLeft: 8 }} onClick={() => {
            // Force the onboarding wizard to re-show. The wizard itself
            // detects the existing household and re-seeds inventory from
            // scratch (it bulk-deletes first, so this is destructive — the
            // user has to confirm). Useful for existing users who want
            // to switch from the old hardcoded English seed to the new
            // Indian kitchen template.
            if (!window.confirm('Re-run pantry setup? Your current kitchen items will be replaced. Continue?')) return
            setHousehold(null)
          }}><Sparkles size={17} /> Re-run pantry setup</button>
        </div>
      </section>}
    </main>

    <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open assistant"><MessageCircle size={22} /></button>

    {chatOpen && <section className="chat-panel" role="dialog" aria-label="Assistant">
      <header>
        <div><span className="bot-avatar">A</span><div><b>Khane ka assistant</b><small>{listening ? 'Listening…' : 'Speaks your language'}</small></div></div>
        <button onClick={() => setChatOpen(false)} aria-label="Close"><X size={18} /></button>
      </header>
      <div className="chat-transcript">
        {chat.map((turn, i) => <div key={i} className={`chat-bubble ${turn.from}`}>
          <p>{turn.text}</p>
          {turn.from === 'bot' && <button onClick={() => speak(turn.text, chatLang)} aria-label="Read aloud"><Volume2 size={12} /></button>}
        </div>)}
      </div>
      <div className="chat-quick">
        {['मैं शाकाहारी हूँ', '5 options दिखाओ', 'we are 6 people', 'मछली मत बनाओ', '3 dishes चाहिए'].map((q) => <button key={q} onClick={() => submitChat(q)}>{q}</button>)}
      </div>
      <div className="chat-input">
        <select value={chatLang} onChange={(e) => setChatLang(e.target.value)} aria-label="Language">
          {SUPPORTED_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type or tap the mic…" onKeyDown={(e) => e.key === 'Enter' && submitChat()} />
        <button onClick={handleSubmitClick} aria-label="Send"><Send size={17} /></button>
        <button
          className={`mic ${listening ? 'live' : ''}`}
          onClick={listening ? stopListening : startListening}
          disabled={!srSupported}
          aria-label={listening ? 'Stop' : 'Speak'}
        >{listening ? <MicOff size={17} /> : <Mic size={17} />}</button>
      </div>
      {!srSupported && <p className="mic-warning">Voice input needs Chrome or Edge. You can still type.</p>}
    </section>}

    <nav className="bottom-nav" aria-label="Primary navigation">
      <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}><UtensilsCrossed /><span>Today</span></button>
      <button className={tab === 'inventory' ? 'active' : ''} onClick={() => setTab('inventory')}><Package /><span>Kitchen</span></button>
      <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><span className="icon-wrap"><ShoppingBasket />{lowStock > 0 && <i>{lowStock}</i>}</span><span>Orders</span></button>
      <button className={tab === 'family' ? 'active' : ''} onClick={() => setTab('family')}><Users /><span>Family</span></button>
      <button className={tab === 'household' ? 'active' : ''} onClick={() => setTab('household')}><Settings2 /><span>Rules</span></button>
    </nav>
    {tutorialStep !== null && tab === 'today' && <TutorialOverlay
      step={tutorialStep}
      totalSteps={3}
      onNext={() => {
        if (tutorialStep >= 2) {
          // Last step's CTA is "Done" — finish the tour.
          localStorage.setItem('kya-tutorial-done', '1')
          setTutorialStep(null)
        } else {
          setTutorialStep(tutorialStep + 1)
        }
      }}
      onSkip={() => {
        localStorage.setItem('kya-tutorial-done', '1')
        setTutorialStep(null)
      }}
    />}
  </div>
}


function FamilyPage({ voters, preferences, voterPreferences, onAddVoter, onRemoveVoter, onAddPreference, onRemovePreference, busy }: { voters: api.Voter[]; preferences: { familyName: string; members: number; vegetarian: boolean }; voterPreferences: api.VoterMealPreference[]; busy: boolean; onAddVoter: (name: string) => Promise<void>; onRemoveVoter: (id: string) => Promise<void>; onAddPreference: (voterId: string, slot: api.MealSlot, mealName: string) => Promise<void>; onRemovePreference: (id: string) => Promise<void> }) {
  const [newName, setNewName] = useState('')
  // Adding-dish UI state: which (voterId, slot) is currently being edited.
  const [addingFor, setAddingFor] = useState<{ voterId: string; slot: api.MealSlot } | null>(null)
  const [newDish, setNewDish] = useState('')
  // Group preferences by (voterId, slot) for the grid render.
  const grouped: Record<string, Record<api.MealSlot, api.VoterMealPreference[]>> = {}
  voterPreferences.forEach((p) => {
    if (!p.slot) return
    if (!grouped[p.voter_id]) grouped[p.voter_id] = { BREAKFAST: [], LUNCH: [], DINNER: [] }
    grouped[p.voter_id][p.slot].push(p)
  })
  const SLOTS: api.MealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER']
  const slotLabel = (s: api.MealSlot) => s === 'BREAKFAST' ? 'Breakfast' : s === 'LUNCH' ? 'Lunch' : 'Dinner'
  const startAdd = (voterId: string, slot: api.MealSlot) => { setAddingFor({ voterId, slot }); setNewDish('') }
  const cancelAdd = () => { setAddingFor(null); setNewDish('') }
  const submitDish = () => {
    if (!addingFor || !newDish.trim()) return
    onAddPreference(addingFor.voterId, addingFor.slot, newDish.trim())
    setNewDish('')
    setAddingFor(null)
  }
  return <section className="page-section family-page">
    <div className="page-heading">
      <span className="eyebrow"><Users size={14} /> YOUR KITCHEN</span>
      <h1>{preferences.familyName} — Family</h1>
      <p>Add the people in your household and what they like for breakfast, lunch, and dinner.</p>
    </div>
    <div className="family-add-row">
      <input placeholder="Add a family member (e.g. Yash, Mom, Dad)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newDish === '' && newName.trim()) { onAddVoter(newName.trim()); setNewName('') } }} disabled={busy} />
      <button className="primary" onClick={() => { if (newName.trim()) { onAddVoter(newName.trim()); setNewName('') } }} disabled={busy || !newName.trim()}><Plus size={16} /> Add</button>
    </div>
    {voters.length === 0 ? <div className="empty-state">
      <Users size={28} />
      <p>No family members yet. Add at least one to start setting meal preferences.</p>
    </div> : <>
      <div className="family-grid">
        <div className="family-grid-header">
          <div className="family-name-col" />
          {SLOTS.map((s) => <div key={s} className="family-slot-col"><span>{slotLabel(s)}</span></div>)}
          <div className="family-actions-col" />
        </div>
        {voters.map((v) => {
          const bySlot = grouped[v.id] || { BREAKFAST: [], LUNCH: [], DINNER: [] }
          return <div key={v.id} className="family-row">
            <div className="family-name-col">
              <b>{v.name}</b>
              <small>code: {v.invite_code}</small>
            </div>
            {SLOTS.map((s) => <div key={s} className="family-slot-col" data-slot={slotLabel(s)}>
              <div className="family-chips">
                {bySlot[s].length === 0 && <span className="family-empty-slot">—</span>}
                {bySlot[s].map((p) => <span key={p.id} className="family-chip">
                  {p.meal_name}
                  <button onClick={() => onRemovePreference(p.id)} disabled={busy} aria-label={`Remove ${p.meal_name}`}><X size={12} /></button>
                </span>)}
              </div>
              {addingFor && addingFor.voterId === v.id && addingFor.slot === s ? <div className="family-add-dish">
                <input autoFocus value={newDish} onChange={(e) => setNewDish(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitDish(); if (e.key === 'Escape') cancelAdd() }} placeholder="e.g. Poha" disabled={busy} />
                <button className="primary mini" onClick={submitDish} disabled={busy || !newDish.trim()}>Add</button>
                <button className="reset-button mini" onClick={cancelAdd} disabled={busy}>Cancel</button>
              </div> : <button className="family-add-dish-btn" onClick={() => startAdd(v.id, s)} disabled={busy}><Plus size={12} /> Add dish</button>}
            </div>)}
            <div className="family-actions-col">
              <button className="family-remove" onClick={() => { if (window.confirm(`Remove ${v.name}?`)) onRemoveVoter(v.id) }} disabled={busy} aria-label={`Remove ${v.name}`}><X size={14} /></button>
            </div>
          </div>
        })}
      </div>
      <div className="family-note">
        <Sparkles size={16} />
        <span>Meal suggestions will start using these preferences once Phase D lands. For now, you can add per-person meal preferences and the chat can read them.</span>
      </div>
    </>}
  </section>
}
function OrderList({ title, subtitle, items, empty, shareText, onShare }: { title: string; subtitle: string; items: { id: string; name: string; quantity: number; unit: string }[]; empty: string; shareText: string; onShare: (text: string) => void }) {
  return <article className="order-card"><div className="order-head"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{items.length}</span></div>
    {items.length === 0 ? <div className="empty-state"><Check size={22} />{empty}</div> : <ul>{items.map((item) => <li key={item.id}><label><input type="checkbox" /><span><b>{item.name}</b><small>Bring stock back to target</small></span></label><strong>{item.quantity.toLocaleString()} {item.unit}</strong></li>)}</ul>}
    {items.length > 0 && <button className="secondary" onClick={() => onShare(shareText)}><Share2 size={17} /> Share list on WhatsApp</button>}
  </article>
}

export default App

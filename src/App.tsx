import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check, ChevronRight, Clock3, Eye, EyeOff, LogOut, MessageCircle, Mic, MicOff, Minus, Package, Plus, RotateCcw, Send, Settings2, Share2, ShoppingBasket, Sparkles, Users, UtensilsCrossed, Volume2, Vote, X } from 'lucide-react'
import './App.css'
import { confirmMeal, DEFAULT_INVENTORY, getOrderSuggestions, recommendMeals, type InventoryItem, type MealOption } from './mealEngine'
import { parseCommand, SUPPORTED_LANGS, type ChatIntent } from './chatBot'
import { addVoter as _addVoter, buildWhatsAppShareUrl, castVote as _castVote, createPoll, getResults, type Poll, type PollResult } from './voting'
import { supabase, SUPABASE_URL } from './supabase'
import * as api from './api'

type Tab = 'today' | 'inventory' | 'orders' | 'household' | 'onboarding' | 'join'

type Preferences = {
  familyName: string
  members: number
  suggestionCount: number
  dishesPerMeal: number
  vegetarian: boolean
  dislikes: string[]
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

function SignIn() {
  const signInWithGoogle = async () => {
    // Always redirect back to the canonical app URL. Using
    // window.location.origin was a footgun: any tab that initiated the
    // sign-in while on localhost (e.g. with `npm run dev` running) sent
    // the post-OAuth callback there, and Supabase happily redirected the
    // user to localhost after Google sign-in.
    const redirectTo = 'https://kya-banayein-theta.vercel.app'
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

function Onboarding({ session, onComplete }: { session: Session; onComplete: (household: api.Household) => void }) {
  const [name, setName] = useState('My Kitchen')
  const [members, setMembers] = useState(4)
  const [vegetarian, setVegetarian] = useState(false)
  const [voting, setVoting] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (skip = false) => {
    setBusy(true)
    try {
      const hh = await api.createHousehold(session.user.id, { name: skip ? 'My Kitchen' : name, members: skip ? 4 : members, vegetarian: skip ? false : vegetarian, voting_enabled: skip ? false : voting, onboarding_complete: true })
      await api.seedInventory(hh.id)
      onComplete(hh)
    } catch (e) {
      console.error(e)
      alert('Could not create household. Try again.')
    } finally { setBusy(false) }
  }

  return <div className="onboarding">
    <div className="onboarding-card">
      <span className="eyebrow"><Sparkles size={14} /> WELCOME</span>
      <h1>Set up your kitchen</h1>
      <p>3 quick questions. Skip any of them — you can change everything later in Rules.</p>
      <label className="onboarding-field">
        <span>Household name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathur Parivaar" />
      </label>
      <div className="onboarding-row">
        <span><b>Family size</b><small>Used for grocery quantities</small></span>
        <Counter value={members} setValue={setMembers} max={12} />
      </div>
      <label className="onboarding-row toggle">
        <span><b>Pure vegetarian household</b><small>No eggs or meat in suggestions</small></span>
        <input type="checkbox" checked={vegetarian} onChange={(e) => setVegetarian(e.target.checked)} />
      </label>
      <label className="onboarding-row toggle">
        <span><b>Enable family voting</b><small>Transparent tally on Today</small></span>
        <input type="checkbox" checked={voting} onChange={(e) => setVoting(e.target.checked)} />
      </label>
      <div className="onboarding-actions">
        <button className="primary" disabled={busy} onClick={() => submit(false)}>Create my kitchen <ChevronRight size={17} /></button>
        <button className="reset-button" disabled={busy} onClick={() => submit(true)}>Skip — use defaults</button>
      </div>
    </div>
  </div>
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
  const [preferences, setPreferences] = useState(() => load('kya-preferences', DEFAULT_PREFERENCES))
  const [inventory, setInventory] = useState<InventoryItem[]>(() => load('kya-inventory', DEFAULT_INVENTORY))
  const [selected, setSelected] = useState<MealOption | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
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
  const [votesToday, setVotesToday] = useState<Record<string, string>>({})
  const [mealHistory, setMealHistory] = useState<api.MealHistoryRow[]>([])
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
        const [inv, voters, votes, history] = await Promise.all([
          api.fetchInventory(hh.id),
          api.fetchVoters(hh.id),
          api.fetchVotesToday(hh.id),
          api.fetchMealHistory(hh.id, 7),
        ])
        if (cancelled) return
        setInventory(inv)
        setMealHistory(history)
        const idx: Record<string, string> = {}
        voters.forEach((v) => { idx[v.name] = v.id })
        setVoterIndex(idx)
        const vmap: Record<string, string> = {}
        votes.forEach((v) => { vmap[v.voter_id] = v.meal_id })
        setVotesToday(vmap)
        setPreferences((p) => ({ ...p, familyName: hh.name, members: hh.members, vegetarian: hh.vegetarian }))
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
    if (preferences.familyName === household.name && preferences.members === household.members && preferences.vegetarian === household.vegetarian && voting.enabled === household.voting_enabled) return
    const t = setTimeout(async () => {
      try {
        const updated = await api.updateHousehold(household.id, { name: preferences.familyName, members: preferences.members, vegetarian: preferences.vegetarian, voting_enabled: voting.enabled })
        setHousehold(updated)
      } catch (e) { console.error('Household sync failed:', e) }
    }, 800)
    return () => clearTimeout(t)
  }, [preferences.familyName, preferences.members, preferences.vegetarian, voting.enabled, household])

  const mealOptions = useMemo(() => recommendMeals(preferences, inventory), [preferences, inventory])
  const orders = useMemo(() => getOrderSuggestions(inventory), [inventory])
  const lowStock = orders.weekly.length + orders.monthly.length
  const voteResult: PollResult = useMemo(() => {
    const voters = Object.entries(voterIndex).map(([name, id]) => ({ name, code: id.slice(0, 5).toUpperCase() }))
    const poll: Poll = { id: 'live', voters, votes: Object.fromEntries(Object.entries(votesToday).map(([id, mealId]) => [id, { mealId }])) }
    return getResults(poll)
  }, [voterIndex, votesToday])

  const chooseMeal = (meal: MealOption) => { setSelected(meal); setConfirmed(null) }
  const confirm = async () => {
    if (!selected) return
    const next = confirmMeal(inventory, selected.dishes.flatMap((dish) => dish.ingredients))
    setInventory(next)
    setConfirmed(selected.id)
    if (household) {
      try {
        await Promise.all(next.map((i) => api.updateInventoryItem(i.id, i.quantity)))
        await api.recordMeal(household.id, selected.id, selected.dishes)
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
        setPreferences((p) => ({ ...p, dislikes: Array.from(new Set([...p.dislikes, intent.dislike!])) }))
        return `Theek hai, ${intent.dislike} kabhi suggest nahi karunga.`
      }
      if (intent.like) {
        return `Accha, ${intent.like} pasand hai. Note kar liya.`
      }
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
  if (!household) return <Onboarding session={session} onComplete={(hh) => { setHousehold(hh); setTab('today') }} />

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
          <div><span className="eyebrow"><Sparkles size={14} /> {todayLabel}</span><h1>{greeting}</h1><p>We found meals that fit your kitchen and your family.</p></div>
          <div className="meal-controls">
            <label><span>Options to show</span><Counter value={preferences.suggestionCount} setValue={(suggestionCount) => setPreferences({ ...preferences, suggestionCount })} /></label>
            <label><span>Dishes per meal</span><Counter value={preferences.dishesPerMeal} setValue={(dishesPerMeal) => setPreferences({ ...preferences, dishesPerMeal })} /></label>
          </div>
        </section>

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
          <div><span className="mini-plate"><UtensilsCrossed size={20} /></span><span><small>{mealNoun}</small><b>{selected.dishes.map((dish) => dish.name).join(' + ')}</b></span></div>
          {confirmed === selected.id ? <button className="confirmed"><Check size={18} /> Inventory updated</button> : <button className="primary" onClick={confirm}>Confirm meal & use stock <ChevronRight size={18} /></button>}
        </section>}
      </>}

      {tab === 'inventory' && <section className="page-section">
        <div className="page-heading"><span className="eyebrow"><Package size={14} /> YOUR KITCHEN</span><h1>Inventory</h1><p>Adjust what is actually available. Meal suggestions update immediately.</p></div>
        <div className="inventory-grid">{inventory.map((item) => {
          const percent = Math.min(100, Math.round((item.quantity / item.targetStock) * 100))
          return <article className="stock-card" key={item.id}>
            <div><span className={`stock-icon ${percent <= 25 ? 'danger' : ''}`}>{item.name.slice(0, 1)}</span><span><b>{item.name}</b><small>{item.category === 'weekly' ? 'Fresh · weekly' : 'Staple · monthly'}</small></span></div>
            <strong>{item.quantity.toLocaleString()} <small>{item.unit}</small></strong>
            <div className="stock-track"><i style={{ width: `${percent}%` }} /></div>
            <div className="stock-actions"><button onClick={async () => { const next = inventory.map((x) => x.id === item.id ? { ...x, quantity: Math.max(0, x.quantity - (x.unit === 'pcs' ? 1 : 100)) } : x); setInventory(next); const it = next.find((x) => x.id === item.id); if (it) { try { await api.updateInventoryItem(it.id, it.quantity) } catch (e) { console.error(e) } } }}><Minus size={16} /></button><span>{percent}% stocked</span><button onClick={async () => { const next = inventory.map((x) => x.id === item.id ? { ...x, quantity: Math.min(x.targetStock, x.quantity + (x.unit === 'pcs' ? 1 : 100)) } : x); setInventory(next); const it = next.find((x) => x.id === item.id); if (it) { try { await api.updateInventoryItem(it.id, it.quantity) } catch (e) { console.error(e) } } }}><Plus size={16} /></button></div>
          </article>
        })}</div>
      </section>}

      {tab === 'orders' && <section className="page-section">
        <div className="page-heading"><span className="eyebrow"><ShoppingBasket size={14} /> SMART REORDER</span><h1>What to buy</h1><p>Fresh food weekly. Pantry staples only when they run low.</p></div>
        <div className="order-columns">
          <OrderList title="Buy this week" subtitle="Fresh produce and dairy" items={orders.weekly} empty="Fresh stock looks good." shareText={groceryListText('Weekly fresh food', orders.weekly)} onShare={shareOnWhatsApp} />
          <OrderList title="Monthly pantry order" subtitle="Staples below their threshold" items={orders.monthly} empty="Staples look good for the month." shareText={groceryListText('Monthly pantry', orders.monthly)} onShare={shareOnWhatsApp} />
        </div>
        <div className="order-note"><Sparkles size={20} /><div><b>How this works</b><p>Confirming a meal deducts its ingredients. The order list uses your stock thresholds—not AI guesses—so quantities remain predictable.</p></div></div>
      </section>}

      {tab === 'household' && <section className="page-section settings-page">
        <div className="page-heading"><span className="eyebrow"><Settings2 size={14} /> HOUSEHOLD RULES</span><h1>Your kitchen, your rules</h1><p>Set this once. Every meal suggestion will respect it.</p></div>
        <div className="settings-card">
          <label className="text-field"><span>Household name</span><input value={preferences.familyName} onChange={(e) => setPreferences({ ...preferences, familyName: e.target.value })} /></label>
          <div className="setting-row"><span><b>Family members</b><small>Used to size ingredient quantities</small></span><Counter value={preferences.members} setValue={(members) => setPreferences({ ...preferences, members })} max={12} /></div>
          <div className="setting-row"><span><b>Meal suggestions</b><small>How many options the family sees</small></span><Counter value={preferences.suggestionCount} setValue={(suggestionCount) => setPreferences({ ...preferences, suggestionCount })} /></div>
          <div className="setting-row"><span><b>Dishes per meal</b><small>Main, side, bread or rice</small></span><Counter value={preferences.dishesPerMeal} setValue={(dishesPerMeal) => setPreferences({ ...preferences, dishesPerMeal })} /></div>
          <label className="setting-row toggle-row"><span><b>Pure vegetarian household</b><small>Never suggest eggs or meat</small></span><input type="checkbox" checked={preferences.vegetarian} onChange={(e) => setPreferences({ ...preferences, vegetarian: e.target.checked })} /></label>
          <label className="setting-row toggle-row"><span><b>Family voting</b><small>Let everyone pick a meal — transparent tally</small></span><input type="checkbox" checked={voting.enabled} onChange={(e) => setVoting((v) => ({ ...v, enabled: e.target.checked }))} /></label>
          {preferences.dislikes.length > 0 && <div className="setting-row"><span><b>Never suggest</b><small>Set by you or the assistant</small></span><div className="dislike-tags">{preferences.dislikes.map((d) => <span className="tag" key={d}>{d}<button onClick={() => setPreferences((p) => ({ ...p, dislikes: p.dislikes.filter((x) => x !== d) }))} aria-label={`Remove ${d}`}><X size={12} /></button></span>)}</div></div>}
          <button className="reset-button" onClick={resetData}><RotateCcw size={17} /> Reset demo data</button>
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
      <button className={tab === 'household' ? 'active' : ''} onClick={() => setTab('household')}><Settings2 /><span>Rules</span></button>
    </nav>
  </div>
}

function OrderList({ title, subtitle, items, empty, shareText, onShare }: { title: string; subtitle: string; items: { id: string; name: string; quantity: number; unit: string }[]; empty: string; shareText: string; onShare: (text: string) => void }) {
  return <article className="order-card"><div className="order-head"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{items.length}</span></div>
    {items.length === 0 ? <div className="empty-state"><Check size={22} />{empty}</div> : <ul>{items.map((item) => <li key={item.id}><label><input type="checkbox" /><span><b>{item.name}</b><small>Bring stock back to target</small></span></label><strong>{item.quantity.toLocaleString()} {item.unit}</strong></li>)}</ul>}
    {items.length > 0 && <button className="secondary" onClick={() => onShare(shareText)}><Share2 size={17} /> Share list on WhatsApp</button>}
  </article>
}

export default App

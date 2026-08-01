import { createClient } from '@supabase/supabase-js'

// Read from Vite env vars (set in Vercel Project Settings → Environment Variables
// for Production / Preview / Development). Local dev: copy .env.example to .env.
const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://orivktxrtiqggemxetyc.supabase.co'
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbG...2nN8'

export const supabase = createClient(URL, ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const SUPABASE_URL = URL

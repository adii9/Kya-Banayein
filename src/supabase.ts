import { createClient } from '@supabase/supabase-js'

// Read from Vite env vars (set in Vercel Project Settings → Environment Variables
// for Production / Preview / Development). Local dev: copy .env.example to .env.
//
// Hard-fail at startup if the keys are missing in production, instead of
// silently using placeholder strings — that mistake shipped a `sb_secret_…`
// key in a public bundle once, and the silent fallback is what let it through.
const URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!URL || !ANON) {
  const env = import.meta.env.MODE
  if (env === 'production') {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in ' +
        'Vercel Project Settings → Environment Variables for Production.',
    )
  } else {
    console.warn(
      '[kya-banayein] Supabase env vars missing — falling back to dev placeholders. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to silence this.',
    )
  }
}

const FALLBACK_URL = 'https://orivktxrtiqggemxetyc.supabase.co'
const FALLBACK_ANON = 'eyJhbG...2nN8'

export const supabase = createClient(URL ?? FALLBACK_URL, ANON ?? FALLBACK_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const SUPABASE_URL = URL ?? FALLBACK_URL

// VITE_APP_URL is the public URL where the deployed app lives. Share links
// (voting, WhatsApp, etc.) MUST point here, not at the raw Supabase URL.
// In production this is the Vercel app; in dev it's whatever the user sets
// or http://localhost:5173 so local links still work.
const APP_URL = import.meta.env.VITE_APP_URL as string | undefined
export const APP_BASE_URL = APP_URL && APP_URL.length > 0 ? APP_URL.replace(/\/$/, '') : 'https://kya-banayein-theta.vercel.app'

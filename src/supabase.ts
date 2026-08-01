import { createClient } from '@supabase/supabase-js'

const URL = 'https://orivktxrtiqggemxetyc.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yaXZrdHhydGlxZ2dlbXhldHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1ODg3MzUsImV4cCI6MjEwMTE2NDczNX0.cXLPkpazEj1lOLCOU_PCs_EY2JxXbvFJQJvLwy62nN8'

export const supabase = createClient(URL, ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const SUPABASE_URL = URL

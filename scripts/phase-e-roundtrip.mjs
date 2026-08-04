#!/usr/bin/env node
// Phase E round-trip integration check.
// Proves the anon key can't read household_meals even with data present.
// (Authenticated checks need a JWT; we cover that via the engine+type
//  tests in src/mealEngine.test.ts instead.)
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first')
  process.exit(1)
}

const supabase = createClient(url, anon, { auth: { persistSession: false } })

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

// 1. Anon SELECT household_meals → must be empty (RLS deny)
const { data: rows, error } = await supabase
  .from('household_meals')
  .select('id, name, dishes, match_count')
  .limit(5)
check('anon SELECT household_meals returns []', Array.isArray(rows) && rows.length === 0, error?.message ?? `${rows.length} rows`)

// 2. Anon INSERT household_meals → must be denied by RLS
const { error: insErr } = await supabase
  .from('household_meals')
  .insert({
    household_id: '00000000-0000-0000-0000-000000000000',
    name: 'should-fail',
    dishes: [{ id: 'x', name: 'y' }],
    match_count: 0,
  })
check('anon INSERT household_meals denied by RLS', insErr?.code === '42501', insErr?.message ?? 'no error')

// 3. Anon UPDATE household_meals → must be denied (RLS makes the WHERE
//    match nothing; the call succeeds but touches 0 rows).
const { data: updRows, error: updErr } = await supabase
  .from('household_meals')
  .update({ name: 'hacked' })
  .eq('household_id', '00000000-0000-0000-0000-000000000000')
  .select('id')
check('anon UPDATE household_meals touches 0 rows (RLS deny)',
  !updErr && Array.isArray(updRows) && updRows.length === 0,
  `${updRows?.length ?? '?'} rows affected${updErr ? `, error=${updErr.code}` : ''}`)

// 4. Anon DELETE household_meals → must be denied (same shape: 0 rows)
const { data: delRows, error: delErr } = await supabase
  .from('household_meals')
  .delete()
  .eq('household_id', '00000000-0000-0000-0000-000000000000')
  .select('id')
check('anon DELETE household_meals touches 0 rows (RLS deny)',
  !delErr && Array.isArray(delRows) && delRows.length === 0,
  `${delRows?.length ?? '?'} rows affected${delErr ? `, error=${delErr.code}` : ''}`)

console.log()
console.log(failures === 0 ? '🎉 All anon-RLS gates hold' : `🚨 ${failures} gate(s) failed`)
process.exit(failures === 0 ? 0 : 1)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { istDateKey } from './dates'

// August 2026 audit caught votes.poll_date being written with
// new Date().toISOString().slice(0, 10) — UTC. An Indian user crossing
// midnight in IST (00:00–05:30 IST) gets the previous UTC date on
// the wire, so the write lands on "yesterday" and the day's own
// poll can't see it. This test pins the clock to that exact window
// and asserts istDateKey returns the IST date, not the UTC date.
describe('istDateKey', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the IST date when local clock is 02:30 IST (UTC is 21:00 prev day)', () => {
    // 2026-08-25T21:00:00Z = 2026-08-26 02:30 IST — the exact bug window.
    vi.setSystemTime(new Date('2026-08-25T21:00:00Z'))
    expect(istDateKey(new Date())).toBe('2026-08-26')
  })

  it('returns the IST date when local clock is 23:30 IST (UTC is 18:00 same day)', () => {
    // 2026-08-26T18:00:00Z = 2026-08-26 23:30 IST — same day on both sides,
    // but a sanity check that the helper doesn't drift in the afternoon.
    vi.setSystemTime(new Date('2026-08-26T18:00:00Z'))
    expect(istDateKey(new Date())).toBe('2026-08-26')
  })

  it('returns the IST date when local clock is 00:00 IST sharp (UTC is 18:30 prev day)', () => {
    // 2026-08-20T18:30:00Z = 2026-08-21 00:00 IST — the boundary itself.
    vi.setSystemTime(new Date('2026-08-20T18:30:00Z'))
    expect(istDateKey(new Date())).toBe('2026-08-21')
  })

  it('agrees that toISOString().slice(0, 10) would have given the wrong date in the bug window', () => {
    // Negative control: prove the test would FAIL if someone reintroduced
    // the UTC version. This is the bug we are guarding against.
    vi.setSystemTime(new Date('2026-08-25T21:00:00Z'))
    const utcSlice = new Date().toISOString().slice(0, 10)
    expect(utcSlice).toBe('2026-08-25')         // what the old code wrote
    expect(istDateKey(new Date())).toBe('2026-08-26') // what the new code writes
    expect(utcSlice).not.toBe(istDateKey(new Date())) // the bug
  })
})

import { describe, it, expect } from 'vitest'
import { perVoterShareUrl } from './voting'

// Per-voter share URL contract.
// Owner-side build (voteShareText in App.tsx) and recipient-side parse
// (VoterLanding reading ?join and ?voter from URLSearchParams) share
// this single string contract. A regression here means the owner
// generates a URL the recipient can't read, or vice versa — exactly
// the share-link bug that shipped to production in Aug 2026.
describe('perVoterShareUrl', () => {
  it('builds a URL with join and voter params', () => {
    const url = perVoterShareUrl('https://kya-banayein-theta.vercel.app', 'JOIN-34B9C', 'ABCD5')
    expect(url).toBe('https://kya-banayein-theta.vercel.app/?join=JOIN-34B9C&voter=ABCD5')
  })

  it('strips trailing slash on base URL', () => {
    const url = perVoterShareUrl('https://kya-banayein-theta.vercel.app/', 'JOIN-34B9C', 'ABCD5')
    expect(url).toBe('https://kya-banayein-theta.vercel.app/?join=JOIN-34B9C&voter=ABCD5')
  })

  it('URL-encodes special characters in the join code', () => {
    // Join codes are uppercase alphanumeric, but the parser uses
    // encodeURIComponent so a code with edge-case chars should encode
    // safely. The current alphabet excludes I/L/0/O so this is
    // belt-and-suspenders, but the contract needs to hold.
    const url = perVoterShareUrl('https://example.com', 'JOIN-A&B', 'ABCD5')
    expect(url).toContain('join=JOIN-A%26B')
  })

  it('URL-encodes the voter token', () => {
    const url = perVoterShareUrl('https://example.com', 'JOIN-34B9C', 'AB CD5')
    expect(url).toContain('voter=AB%20CD5')
  })

  it('uses invitation tokens not voter UUIDs', () => {
    // Per design: the URL carries the 5-char invite_code, not the
    // voter UUID. UUIDs in URLs leak implementation and are guessable
    // in a 1.6e13-key space. The 5-char invite_code is 32^5 ≈ 3.3e7
    // keys so enumeration is infeasible (and stays the existing
    // voters.invite_code column, no new token to manage).
    const url = perVoterShareUrl('https://example.com', 'JOIN-34B9C', 'ABCD5')
    expect(url).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })

  it('round-trips through URLSearchParams the way VoterLanding parses it', () => {
    // The parse side uses `new URLSearchParams(window.location.search)`
    // and reads `params.get('join')` and `params.get('voter')`. If
    // the builder ever wrote a different param name, the recipient
    // would never see the token. Verify the names match.
    const url = perVoterShareUrl('https://kya-banayein-theta.vercel.app', 'JOIN-34B9C', 'ABCD5')
    const params = new URLSearchParams(new URL(url).search)
    expect(params.get('join')).toBe('JOIN-34B9C')
    expect(params.get('voter')).toBe('ABCD5')
  })

  it('preserves the path root (no trailing segments)', () => {
    // The App's router fires on `/?join=...` — if we accidentally
    // generated `/voter/?join=...` the param would never be read.
    const url = perVoterShareUrl('https://kya-banayein-theta.vercel.app', 'JOIN-34B9C', 'ABCD5')
    expect(url).toMatch(/^https:\/\/kya-banayein-theta\.vercel\.app\/\?join=/)
  })
})

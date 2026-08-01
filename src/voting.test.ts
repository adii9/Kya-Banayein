import { describe, expect, it } from 'vitest'
import { addVoter, buildWhatsAppShareUrl, castVote, createPoll, getResults } from './voting'

describe('createPoll / addVoter', () => {
  it('creates a poll with stable codes per member', () => {
    let poll = createPoll(['Aarav', 'Diya'])
    poll = addVoter(poll, 'Aarav')
    poll = addVoter(poll, 'Diya')
    const codes = poll.voters.map((v) => v.code)
    expect(new Set(codes).size).toBe(2)
    codes.forEach((c) => expect(/^[A-Z0-9]{4,5}$/.test(c)).toBe(true))
  })

  it('does not duplicate a voter by name (case-insensitive)', () => {
    let poll = createPoll([])
    poll = addVoter(poll, 'Aarav')
    poll = addVoter(poll, 'aarav')
    expect(poll.voters).toHaveLength(1)
  })
})

describe('castVote', () => {
  it('records a vote for a known voter and updates the result', () => {
    let poll = createPoll(['Aarav', 'Diya'])
    poll = addVoter(poll, 'Aarav')
    poll = addVoter(poll, 'Diya')
    const aarav = poll.voters[0].code
    poll = castVote(poll, aarav, 'meal-1')
    const result = getResults(poll)
    expect(result.tallies['meal-1']).toBe(1)
    expect(result.totalVoters).toBe(2)
    expect(result.castCount).toBe(1)
    expect(result.votedNames).toEqual(['Aarav'])
  })

  it('keeps all votes transparent: a new vote reveals everyone who voted', () => {
    let poll = createPoll(['Aarav', 'Diya', 'Kabir'])
    poll = addVoter(poll, 'Aarav')
    poll = addVoter(poll, 'Diya')
    poll = addVoter(poll, 'Kabir')
    const [a, d, k] = poll.voters.map((v) => v.code)
    poll = castVote(poll, d, 'meal-2')
    let result = getResults(poll)
    expect(result.votedNames).toEqual(['Diya'])
    poll = castVote(poll, a, 'meal-1')
    result = getResults(poll)
    expect(result.votedNames.sort()).toEqual(['Aarav', 'Diya'])
    poll = castVote(poll, k, 'meal-2')
    result = getResults(poll)
    expect(result.winner).toBe('meal-2')
  })

  it('allows a voter to change their pick', () => {
    let poll = createPoll(['Aarav'])
    poll = addVoter(poll, 'Aarav')
    const code = poll.voters[0].code
    poll = castVote(poll, code, 'meal-1')
    poll = castVote(poll, code, 'meal-2')
    const result = getResults(poll)
    expect(result.tallies['meal-1'] ?? 0).toBe(0)
    expect(result.tallies['meal-2']).toBe(1)
  })

  it('refuses an unknown code', () => {
    const poll = createPoll([])
    expect(() => castVote(poll, 'NOPE', 'meal-1')).toThrow(/unknown/i)
  })
})

describe('getResults', () => {
  it('picks the highest-tally meal as winner', () => {
    let poll = createPoll(['Aarav', 'Diya', 'Kabir'])
    poll = addVoter(poll, 'Aarav')
    poll = addVoter(poll, 'Diya')
    poll = addVoter(poll, 'Kabir')
    const [a, d, k] = poll.voters.map((v) => v.code)
    poll = castVote(poll, a, 'meal-1')
    poll = castVote(poll, d, 'meal-1')
    poll = castVote(poll, k, 'meal-2')
    expect(getResults(poll).winner).toBe('meal-1')
  })

  it('returns null winner when nobody has voted', () => {
    const poll = createPoll(['Aarav'])
    expect(getResults(poll).winner).toBeNull()
  })
})

describe('buildWhatsAppShareUrl', () => {
  it('encodes the message and points to wa.me', () => {
    const url = buildWhatsAppShareUrl('Aaj vote karo!\nOptions: 1, 2, 3')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    const decoded = decodeURIComponent(url.split('text=')[1])
    expect(decoded).toContain('Aaj vote karo!')
    expect(decoded).toContain('1, 2, 3')
  })
})

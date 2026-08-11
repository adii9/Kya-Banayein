export type Voter = { name: string; code: string }
export type Vote = { mealId: string }
export type Poll = {
  id: string
  voters: Voter[]
  votes: Record<string, Vote>
}

export type PollResult = {
  winner: string | null
  totalVoters: number
  castCount: number
  tallies: Record<string, number>
  votedNames: string[]
  perVoter: { name: string; code: string; mealId: string | null }[]
}

export const shortCode = /^[A-Z0-9]{4,5}$/

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const generateCode = (): string => {
  let out = ''
  for (let i = 0; i < 5; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'home'

export const createPoll = (memberNames: string[]): Poll => {
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return { id: `poll-${slug(memberNames.join('-') || 'home')}-${seed}`, voters: [], votes: {} }
}

export const addVoter = (poll: Poll, name: string): Poll => {
  const trimmed = name.trim()
  if (!trimmed) return poll
  if (poll.voters.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())) return poll
  let code = generateCode()
  while (poll.voters.some((v) => v.code === code)) code = generateCode()
  return { ...poll, voters: [...poll.voters, { name: trimmed, code }] }
}

export const castVote = (poll: Poll, code: string, mealId: string): Poll => {
  const voter = poll.voters.find((v) => v.code === code)
  if (!voter) throw new Error('Unknown voting code')
  return { ...poll, votes: { ...poll.votes, [code]: { mealId } } }
}

export const getResults = (poll: Poll): PollResult => {
  const tallies: Record<string, number> = {}
  const votedNames: string[] = []
  for (const voter of poll.voters) {
    const vote = poll.votes[voter.code]
    if (vote) {
      tallies[vote.mealId] = (tallies[vote.mealId] ?? 0) + 1
      votedNames.push(voter.name)
    }
  }
  let winner: string | null = null
  let max = 0
  for (const [mealId, count] of Object.entries(tallies)) {
    if (count > max) { max = count; winner = mealId }
  }
  return {
    winner,
    totalVoters: poll.voters.length,
    castCount: votedNames.length,
    tallies,
    votedNames,
    perVoter: poll.voters.map((v) => ({ name: v.name, code: v.code, mealId: poll.votes[v.code]?.mealId ?? null })),
  }
}

export const buildWhatsAppShareUrl = (text: string): string =>
  `https://wa.me/?text=${encodeURIComponent(text)}`

// Per-voter share URL. The owner renders one of these per voter on
// the Family tab so each family member gets a token-bound link. The
// voter token is the same invite_code we already generate for the
// in-app voter picker — 5 chars from a 32-char unambiguous alphabet
// (no I/L/0/O), uppercased. VoterLanding reads the `voter` query
// param and skips the name picker.
//
// `joinCode` alone is still a valid href (VoterLanding falls back to
// the name picker when no voter token is present), so existing share
// links keep working.
export const perVoterShareUrl = (baseUrl: string, joinCode: string, voterToken: string): string =>
  `${baseUrl.replace(/\/$/, '')}/?join=${encodeURIComponent(joinCode)}&voter=${encodeURIComponent(voterToken)}`

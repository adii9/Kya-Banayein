import { describe, expect, it } from 'vitest'
import { parseCommand } from './chatBot'

describe('parseCommand', () => {
  it('recognises vegetarian preference in Hindi', () => {
    const result = parseCommand('मैं शाकाहारी हूँ')
    expect(result.kind).toBe('preference')
    if (result.kind !== 'preference') throw new Error('expected preference')
    expect(result.action).toBe('set-vegetarian')
    expect(result.value).toBe(true)
  })

  it('recognises non-vegetarian preference in Tamil', () => {
    const result = parseCommand('நான் சைவம் கிடையாது')
    expect(result.kind).toBe('preference')
    if (result.kind !== 'preference') throw new Error('expected preference')
    expect(result.action).toBe('set-vegetarian')
    expect(result.value).toBe(false)
  })

  it('recognises increase-suggestion in Telugu', () => {
    const result = parseCommand('ఐదు ఆహార ప్రతిపాదనలు చూపించు')
    expect(result.kind).toBe('preference')
    if (result.kind !== 'preference') throw new Error('expected preference')
    expect(result.action).toBe('set-suggestions')
    expect(result.value).toBe(5)
  })

  it('recognises dishes per meal in Bengali', () => {
    const result = parseCommand('৩টা পদ চাই প্রতি বেলায়')
    expect(result.kind).toBe('preference')
    if (result.kind !== 'preference') throw new Error('expected preference')
    expect(result.action).toBe('set-dishes')
    expect(result.value).toBe(3)
  })

  it('recognises a feed change in Kannada', () => {
    const result = parseCommand('ಇಂದು ಮೀನು ಬೇಡ')
    expect(result.kind).toBe('feed')
    if (result.kind !== 'feed') throw new Error('expected feed')
    expect(result.dislike).toBe('fish')
  })

  it('recognises changing a household member count in English', () => {
    const result = parseCommand('we are 5 people at home now')
    expect(result.kind).toBe('preference')
    if (result.kind !== 'preference') throw new Error('expected preference')
    expect(result.action).toBe('set-members')
    expect(result.value).toBe(5)
  })

  it('returns unknown with a friendly reply for unrelated input', () => {
    const result = parseCommand('what is the weather today')
    expect(result.kind).toBe('unknown')
    if (result.kind !== 'unknown') throw new Error('expected unknown')
    expect(result.reply).toMatch(/meal|खान|பதம்|ఆహార|ભોજ/i)
  })
})

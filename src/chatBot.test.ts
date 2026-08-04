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

  // B7 — preference-record intent
  it('emits preference-record when a known voter name + dish + slot appear', () => {
    const result = parseCommand('Diya loves poha for breakfast', ['Diya', 'Mom'])
    expect(result.kind).toBe('preference-record')
    if (result.kind !== 'preference-record') throw new Error('expected preference-record')
    expect(result.voterName).toBe('Diya')
    expect(result.slot).toBe('BREAKFAST')
    expect(result.mealName).toBeTruthy()  // any non-empty dish name (poha isn't in DISH_KEYWORDS so it falls back to extractNoun; either way the intent fires)
  })

  it('does not emit preference-record when no voters are passed', () => {
    const result = parseCommand('Diya loves poha for breakfast')
    // With no voter names hint, the parser can't disambiguate and falls
    // through to the like/feed branch or unknown. We assert it does NOT
    // claim to be a preference-record, so the App doesn't silently attach.
    expect(result.kind).not.toBe('preference-record')
  })

  it('does not emit preference-record when the named voter is unknown', () => {
    const result = parseCommand('Diya loves poha for breakfast', ['Mom', 'Dad'])
    expect(result.kind).not.toBe('preference-record')
  })
})

import { describe, expect, it } from 'vitest'
import { detectNonHumanAudio, isOptOutRequest } from '../server/src/services/safety.js'

describe('detectNonHumanAudio', () => {
  it('detects IVR keypad prompts', () => {
    expect(detectNonHumanAudio('Thank you for calling. Press 1 for English.')).toBe(true)
  })

  it('detects hold messages', () => {
    expect(detectNonHumanAudio('Your call is very important to us. Please hold.')).toBe(true)
  })

  it('does not flag normal patient confirmation', () => {
    expect(detectNonHumanAudio('Yes, this is John.')).toBe(false)
  })

  it('does not flag normal patient decline', () => {
    expect(detectNonHumanAudio('No thanks.')).toBe(false)
  })
})

describe('isOptOutRequest', () => {
  it('detects stop calling request', () => {
    expect(isOptOutRequest('stop calling me')).toBe(true)
  })

  it('detects list removal request', () => {
    expect(isOptOutRequest('remove me from your list')).toBe(true)
  })

  it('does not flag positive confirmation', () => {
    expect(isOptOutRequest('yes please')).toBe(false)
  })

  it('does not flag simple decline as opt-out', () => {
    expect(isOptOutRequest('no thanks')).toBe(false)
  })
})

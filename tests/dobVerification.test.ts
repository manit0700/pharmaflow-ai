import { describe, expect, it } from 'vitest'
import { verifyDob } from '../server/src/services/twilioFlow.js'

describe('verifyDob', () => {
  it('matches spoken digit DOB', () => {
    expect(verifyDob('zero one zero one', '01/01/1990')).toBe(true)
  })

  it('matches spoken month and day', () => {
    expect(verifyDob('January first', '01/01/1990')).toBe(true)
  })

  it('matches compact MMDD input', () => {
    expect(verifyDob('0101', '01/01/1990')).toBe(true)
  })

  it('matches slashed month and day input', () => {
    expect(verifyDob('02/15', '02/15/1985')).toBe(true)
  })

  it('rejects wrong DOB input', () => {
    expect(verifyDob('wrong dob', '01/01/1990')).toBe(false)
  })

  it('rejects empty input', () => {
    expect(verifyDob('', '01/01/1990')).toBe(false)
  })
})

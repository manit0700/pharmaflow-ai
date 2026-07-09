import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeRetryTime } from '../server/src/services/voicemailRetry.js'

describe('computeRetryTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules voicemail retry 4 hours later', () => {
    vi.setSystemTime(new Date('2026-01-15T10:00:00-06:00'))
    const retryAt = computeRetryTime('voicemail', new Date(Date.now()))
    expect(retryAt?.getHours()).toBe(14)
  })

  it('schedules no-answer retry 2 hours later', () => {
    vi.setSystemTime(new Date('2026-01-15T10:00:00-06:00'))
    const retryAt = computeRetryTime('no_answer', new Date(Date.now()))
    expect(retryAt?.getHours()).toBe(12)
  })

  it('schedules busy retry 1 hour later', () => {
    vi.setSystemTime(new Date('2026-01-15T10:00:00-06:00'))
    const retryAt = computeRetryTime('busy', new Date(Date.now()))
    expect(retryAt?.getHours()).toBe(11)
  })

  it('caps voicemail retry at 6pm', () => {
    vi.setSystemTime(new Date('2026-01-15T15:00:00-06:00'))
    const retryAt = computeRetryTime('voicemail', new Date(Date.now()))
    expect(retryAt?.getHours()).toBe(18)
  })

  it('does not schedule after 6pm', () => {
    vi.setSystemTime(new Date('2026-01-15T19:00:00-06:00'))
    expect(computeRetryTime('voicemail', new Date(Date.now()))).toBeNull()
  })
})

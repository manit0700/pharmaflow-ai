/**
 * Pure-function tests — no test framework required.
 * Run with: node server/tests/helpers.test.mjs
 */
import assert from 'node:assert/strict'

// ────────────────────────────────────────────────────────────────────────────
// detectNonHumanAudio — inline copy so we can test without building
// ────────────────────────────────────────────────────────────────────────────
const IVR_PHRASES = [
  // Voicemail openers
  'you have reached the voicemail',
  'you have reached',
  'you have reached the voice mail',
  'the person you are trying to reach',
  'currently unavailable',
  'is not available',
  'is currently unavailable',
  // Leave-message prompts
  'please leave a message',
  'leave a message',
  'leave your message',
  'leave us a message',
  'please record your message',
  'record your message after the tone',
  'at the tone',
  'after the tone',
  'after the beep',
  // Mailbox states
  'mailbox is full',
  'mailbox',
  'voicemail',
  // Keypad IVR menus
  'press 1',
  'press 2',
  'press 3',
  'press 4',
  'press 0',
  'press one',
  'press two',
  'press three',
  'press zero',
  'press the pound',
  'press the star',
  'for english press',
  'para espanol',
  'to repeat this menu',
  // Hold / queue messages
  'please hold',
  'all of our representatives',
  'all agents are',
  'your estimated wait',
  'your call will be answered',
  'your call is important',
  'your call may be recorded',
  'for quality assurance',
  'thank you for calling',
  'thank you for holding',
  // Emergency / safety prompts
  'if this is an emergency',
  // Carrier / disconnected messages
  'the number you have dialed',
  'cannot be completed as dialed',
  'cannot be completed',
  'has been disconnected',
  'no longer in service',
  'not in service',
  'this number is not',
  // Generic automation markers
  'business hours',
  'automated system',
  'automated message',
]

function detectNonHumanAudio(text) {
  if (!text) return false
  const lower = text.toLowerCase()
  return IVR_PHRASES.some((phrase) => lower.includes(phrase))
}

// ────────────────────────────────────────────────────────────────────────────
// canTransitionCallStatus — inline subset for FINAL_STATUSES guard
// ────────────────────────────────────────────────────────────────────────────
const FINAL_STATUSES = new Set([
  'completed', 'escalated', 'callback_requested', 'voicemail',
  'no_answer', 'busy', 'failed', 'canceled', 'needs_review',
])
const ACTIVE_STATUSES = new Set([
  'queued', 'queued_live', 'dialing', 'ringing', 'in_progress', 'scheduled',
])

function twilioCbTransition(currentStatus, nextStatus) {
  if (FINAL_STATUSES.has(currentStatus) && ACTIVE_STATUSES.has(nextStatus)) {
    return { allowed: false, reason: 'active revert after final' }
  }
  if (FINAL_STATUSES.has(currentStatus) && currentStatus !== 'completed' && nextStatus === 'completed') {
    return { allowed: false, reason: 'completed must not overwrite final' }
  }
  return { allowed: true }
}

// ────────────────────────────────────────────────────────────────────────────
// markStaleActiveCalls filter — pure logic (no DB)
// ────────────────────────────────────────────────────────────────────────────
const STALE_ACTIVE_STATUSES = new Set(['queued_live', 'dialing', 'ringing', 'in_progress'])

function isStaleCandidate(job, cutoffMs) {
  return STALE_ACTIVE_STATUSES.has(job.callStatus) && new Date(job.updatedAt).getTime() < cutoffMs
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
    failed++
  }
}

console.log('\n--- detectNonHumanAudio ---')
// Original phrases
test('detects "the person you are trying to reach"', () => {
  assert.equal(detectNonHumanAudio('The person you are trying to reach is not available'), true)
})
test('detects "leave a message"', () => {
  assert.equal(detectNonHumanAudio('Please leave a message after the tone'), true)
})
test('detects "press 1"', () => {
  assert.equal(detectNonHumanAudio('For English press 1'), true)
})
test('detects "voicemail"', () => {
  assert.equal(detectNonHumanAudio('Your voicemail is full'), true)
})
test('detects "if this is an emergency"', () => {
  assert.equal(detectNonHumanAudio('If this is an emergency please hang up'), true)
})
// Newly added phrases
test('detects "you have reached" (most common voicemail opener)', () => {
  assert.equal(detectNonHumanAudio('You have reached John Smith. I am not available.'), true)
})
test('detects "you have reached the voicemail"', () => {
  assert.equal(detectNonHumanAudio("You have reached the voicemail of the person you called."), true)
})
test('detects "currently unavailable"', () => {
  assert.equal(detectNonHumanAudio('The person you called is currently unavailable.'), true)
})
test('detects "thank you for calling"', () => {
  assert.equal(detectNonHumanAudio('Thank you for calling ABC Medical. For sales press 1.'), true)
})
test('detects "thank you for holding"', () => {
  assert.equal(detectNonHumanAudio('Thank you for holding. Your call will be answered shortly.'), true)
})
test('detects "all of our representatives"', () => {
  assert.equal(detectNonHumanAudio('All of our representatives are currently busy.'), true)
})
test('detects "your estimated wait"', () => {
  assert.equal(detectNonHumanAudio('Your estimated wait time is 5 minutes.'), true)
})
test('detects "cannot be completed"', () => {
  assert.equal(detectNonHumanAudio('This call cannot be completed as dialed.'), true)
})
test('detects "for english press"', () => {
  assert.equal(detectNonHumanAudio('For English press 1. Para espanol oprima dos.'), true)
})
test('detects "after the beep"', () => {
  assert.equal(detectNonHumanAudio('Please leave your message after the beep.'), true)
})
test('detects "please record your message"', () => {
  assert.equal(detectNonHumanAudio('Please record your message after the tone.'), true)
})
test('detects "press 2" and "press 3"', () => {
  assert.equal(detectNonHumanAudio('For support press 2, for billing press 3.'), true)
})
test('detects "automated message"', () => {
  assert.equal(detectNonHumanAudio('This is an automated message from your pharmacy.'), true)
})
// Verified non-matches (patient speech)
test('does NOT flag real patient speech "January first"', () => {
  assert.equal(detectNonHumanAudio('January first'), false)
})
test('does NOT flag "yes please process"', () => {
  assert.equal(detectNonHumanAudio('yes please process'), false)
})
test('does NOT flag "zero one zero one"', () => {
  assert.equal(detectNonHumanAudio('zero one zero one'), false)
})
test('does NOT flag "no not today"', () => {
  assert.equal(detectNonHumanAudio('no not today'), false)
})
test('does NOT flag "I need a refill"', () => {
  assert.equal(detectNonHumanAudio('I need a refill for my medication'), false)
})
test('returns false for empty string', () => {
  assert.equal(detectNonHumanAudio(''), false)
})
test('is case-insensitive', () => {
  assert.equal(detectNonHumanAudio('PLEASE HOLD FOR THE NEXT AVAILABLE'), true)
})

console.log('\n--- final status not overwritten ---')
test('needs_review is in FINAL_STATUSES', () => {
  assert.equal(FINAL_STATUSES.has('needs_review'), true)
})
test('twilio completed cannot overwrite needs_review', () => {
  const result = twilioCbTransition('needs_review', 'completed')
  assert.equal(result.allowed, false)
})
test('twilio in_progress cannot overwrite needs_review', () => {
  const result = twilioCbTransition('needs_review', 'in_progress')
  assert.equal(result.allowed, false)
})
test('twilio completed cannot overwrite escalated', () => {
  const result = twilioCbTransition('escalated', 'completed')
  assert.equal(result.allowed, false)
})
test('queued → in_progress is allowed', () => {
  const result = twilioCbTransition('queued', 'in_progress')
  assert.equal(result.allowed, true)
})

console.log('\n--- stale timeout excludes completed calls ---')
const NOW = Date.now()
const OLD = new Date(NOW - 10 * 60 * 1000).toISOString()  // 10 min ago
const RECENT = new Date(NOW - 1 * 60 * 1000).toISOString() // 1 min ago
const CUTOFF = NOW - 5 * 60 * 1000                         // 5 min threshold

test('in_progress + old updatedAt = stale candidate', () => {
  assert.equal(isStaleCandidate({ callStatus: 'in_progress', updatedAt: OLD }, CUTOFF), true)
})
test('queued_live + old updatedAt = stale candidate', () => {
  assert.equal(isStaleCandidate({ callStatus: 'queued_live', updatedAt: OLD }, CUTOFF), true)
})
test('completed + old updatedAt = NOT stale candidate', () => {
  assert.equal(isStaleCandidate({ callStatus: 'completed', updatedAt: OLD }, CUTOFF), false)
})
test('escalated + old updatedAt = NOT stale candidate', () => {
  assert.equal(isStaleCandidate({ callStatus: 'escalated', updatedAt: OLD }, CUTOFF), false)
})
test('needs_review + old updatedAt = NOT stale candidate', () => {
  assert.equal(isStaleCandidate({ callStatus: 'needs_review', updatedAt: OLD }, CUTOFF), false)
})
test('in_progress + recent updatedAt = NOT stale (too new)', () => {
  assert.equal(isStaleCandidate({ callStatus: 'in_progress', updatedAt: RECENT }, CUTOFF), false)
})

// ────────────────────────────────────────────────────────────────────────────
// computeDueDateTime — mirrors followUpTasks.ts
// ────────────────────────────────────────────────────────────────────────────
function computeDueDateTime(priority, baseDate = new Date()) {
  const hour = baseDate.getHours()
  if (priority === 'urgent') {
    return { dueDate: baseDate.toISOString().slice(0, 10), dueTime: '17:00' }
  }
  if (priority === 'high') {
    if (hour < 15) return { dueDate: baseDate.toISOString().slice(0, 10), dueTime: '17:00' }
    const next = new Date(baseDate)
    next.setDate(next.getDate() + 1)
    return { dueDate: next.toISOString().slice(0, 10), dueTime: '10:00' }
  }
  const next = new Date(baseDate)
  next.setDate(next.getDate() + 1)
  const dow = next.getDay()
  if (dow === 6) next.setDate(next.getDate() + 2)
  if (dow === 0) next.setDate(next.getDate() + 1)
  return { dueDate: next.toISOString().slice(0, 10), dueTime: '17:00' }
}

const MONDAY_10AM = new Date('2026-06-29T10:00:00')
const MONDAY_4PM  = new Date('2026-06-29T16:00:00')
const FRIDAY_10AM = new Date('2026-06-26T10:00:00')

console.log('\n--- computeDueDateTime ---')
test('urgent: same day 17:00', () => {
  const r = computeDueDateTime('urgent', MONDAY_10AM)
  assert.equal(r.dueDate, '2026-06-29')
  assert.equal(r.dueTime, '17:00')
})
test('high before 15:00: same day 17:00', () => {
  const r = computeDueDateTime('high', MONDAY_10AM)
  assert.equal(r.dueDate, '2026-06-29')
  assert.equal(r.dueTime, '17:00')
})
test('high after 15:00: next day 10:00', () => {
  const r = computeDueDateTime('high', MONDAY_4PM)
  assert.equal(r.dueDate, '2026-06-30')
  assert.equal(r.dueTime, '10:00')
})
test('normal Mon: next day (Tue)', () => {
  const r = computeDueDateTime('normal', MONDAY_10AM)
  assert.equal(r.dueDate, '2026-06-30')
  assert.equal(r.dueTime, '17:00')
})
test('normal Fri: skips weekend to Mon', () => {
  const r = computeDueDateTime('normal', FRIDAY_10AM)
  assert.equal(r.dueDate, '2026-06-29')
  assert.equal(r.dueTime, '17:00')
})

// ────────────────────────────────────────────────────────────────────────────
// batch scheduler eligibility — pure logic (no DB)
// Mirrors runDueBatchScheduledCalls query conditions
// ────────────────────────────────────────────────────────────────────────────
function isBatchEligible(job, now) {
  return (
    job.callStatus === 'scheduled' &&
    job.retryOfCallJobId === null &&
    job.validationStatus === 'valid' &&
    job.twilioCallSid === null &&
    job.scheduledFor !== null &&
    new Date(job.scheduledFor) <= now
  )
}

const NOW_DATE = new Date()
const PAST = new Date(NOW_DATE.getTime() - 60_000).toISOString()
const FUTURE = new Date(NOW_DATE.getTime() + 60_000).toISOString()

console.log('\n--- batch scheduler eligibility ---')
test('original job due in past → eligible', () => {
  assert.equal(
    isBatchEligible({ callStatus: 'scheduled', retryOfCallJobId: null, validationStatus: 'valid', twilioCallSid: null, scheduledFor: PAST }, NOW_DATE),
    true,
  )
})
test('job scheduled in future → NOT eligible yet', () => {
  assert.equal(
    isBatchEligible({ callStatus: 'scheduled', retryOfCallJobId: null, validationStatus: 'valid', twilioCallSid: null, scheduledFor: FUTURE }, NOW_DATE),
    false,
  )
})
test('retry job (retryOfCallJobId set) → NOT batch eligible', () => {
  assert.equal(
    isBatchEligible({ callStatus: 'scheduled', retryOfCallJobId: 'some-id', validationStatus: 'valid', twilioCallSid: null, scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('job already dialing (twilioCallSid set) → NOT eligible', () => {
  assert.equal(
    isBatchEligible({ callStatus: 'scheduled', retryOfCallJobId: null, validationStatus: 'valid', twilioCallSid: 'CA123', scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('invalid job → NOT eligible', () => {
  assert.equal(
    isBatchEligible({ callStatus: 'scheduled', retryOfCallJobId: null, validationStatus: 'invalid', twilioCallSid: null, scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('completed job → NOT eligible', () => {
  assert.equal(
    isBatchEligible({ callStatus: 'completed', retryOfCallJobId: null, validationStatus: 'valid', twilioCallSid: null, scheduledFor: PAST }, NOW_DATE),
    false,
  )
})

// ────────────────────────────────────────────────────────────────────────────
// atomic claim eligibility — mirrors updateMany WHERE in both schedulers
// count === 0 means the job was already claimed or is no longer in qualifying state
// ────────────────────────────────────────────────────────────────────────────
const RETRY_STATUSES = new Set(['scheduled', 'queued'])

function isBatchClaimEligible(job, now) {
  return (
    job.callStatus === 'scheduled' &&
    job.twilioCallSid === null &&
    job.retryOfCallJobId === null &&
    job.validationStatus === 'valid' &&
    job.scheduledFor !== null &&
    new Date(job.scheduledFor) <= now
  )
}

function isRetryClaimEligible(job, now) {
  return (
    job.retryStatus === 'scheduled' &&
    RETRY_STATUSES.has(job.callStatus) &&
    job.twilioCallSid === null &&
    job.retryOfCallJobId !== null &&
    job.scheduledFor !== null &&
    new Date(job.scheduledFor) <= now
  )
}

console.log('\n--- atomic claim eligibility ---')

// Batch claim
test('batch claim: qualifying job → claim succeeds (count would be 1)', () => {
  assert.equal(
    isBatchClaimEligible({ callStatus: 'scheduled', twilioCallSid: null, retryOfCallJobId: null, validationStatus: 'valid', scheduledFor: PAST }, NOW_DATE),
    true,
  )
})
test('batch claim: already queued (claimed by other runner) → count would be 0', () => {
  assert.equal(
    isBatchClaimEligible({ callStatus: 'queued', twilioCallSid: null, retryOfCallJobId: null, validationStatus: 'valid', scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('batch claim: twilioCallSid set (already dialing) → count would be 0', () => {
  assert.equal(
    isBatchClaimEligible({ callStatus: 'scheduled', twilioCallSid: 'CA123', retryOfCallJobId: null, validationStatus: 'valid', scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('batch claim: terminal callStatus (completed) → count would be 0', () => {
  assert.equal(
    isBatchClaimEligible({ callStatus: 'completed', twilioCallSid: null, retryOfCallJobId: null, validationStatus: 'valid', scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('batch claim: future scheduledFor → count would be 0', () => {
  assert.equal(
    isBatchClaimEligible({ callStatus: 'scheduled', twilioCallSid: null, retryOfCallJobId: null, validationStatus: 'valid', scheduledFor: FUTURE }, NOW_DATE),
    false,
  )
})

// Retry claim
test('retry claim: qualifying retry job → claim succeeds (count would be 1)', () => {
  assert.equal(
    isRetryClaimEligible({ retryStatus: 'scheduled', callStatus: 'scheduled', twilioCallSid: null, retryOfCallJobId: 'parent-id', scheduledFor: PAST }, NOW_DATE),
    true,
  )
})
test('retry claim: retryStatus already in_progress → count would be 0', () => {
  assert.equal(
    isRetryClaimEligible({ retryStatus: 'in_progress', callStatus: 'queued', twilioCallSid: null, retryOfCallJobId: 'parent-id', scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('retry claim: twilioCallSid set → count would be 0', () => {
  assert.equal(
    isRetryClaimEligible({ retryStatus: 'scheduled', callStatus: 'queued', twilioCallSid: 'CA456', retryOfCallJobId: 'parent-id', scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('retry claim: retryOfCallJobId null (not a retry) → count would be 0', () => {
  assert.equal(
    isRetryClaimEligible({ retryStatus: 'scheduled', callStatus: 'scheduled', twilioCallSid: null, retryOfCallJobId: null, scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('retry claim: terminal callStatus → count would be 0', () => {
  assert.equal(
    isRetryClaimEligible({ retryStatus: 'scheduled', callStatus: 'completed', twilioCallSid: null, retryOfCallJobId: 'parent-id', scheduledFor: PAST }, NOW_DATE),
    false,
  )
})
test('retry claim: callStatus queued (also valid pre-dial state) → eligible', () => {
  assert.equal(
    isRetryClaimEligible({ retryStatus: 'scheduled', callStatus: 'queued', twilioCallSid: null, retryOfCallJobId: 'parent-id', scheduledFor: PAST }, NOW_DATE),
    true,
  )
})

console.log(`\nResult: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

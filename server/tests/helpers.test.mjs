/**
 * Pure-function tests — no test framework required.
 * Run with: node server/tests/helpers.test.mjs
 */
import assert from 'node:assert/strict'

// ────────────────────────────────────────────────────────────────────────────
// detectNonHumanAudio — inline copy so we can test without building
// ────────────────────────────────────────────────────────────────────────────
const IVR_PHRASES = [
  'the person you are trying to reach',
  'is not available',
  'leave a message',
  'leave your message',
  'at the tone',
  'after the tone',
  'mailbox is full',
  'mailbox',
  'voicemail',
  'press 1',
  'press one',
  'if this is an emergency',
  'please hold',
  'your call may be recorded',
  'business hours',
  'automated system',
  'not in service',
  'the number you have dialed',
  'has been disconnected',
  'no longer in service',
  'this number is not',
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
test('does NOT flag real patient speech "January first"', () => {
  assert.equal(detectNonHumanAudio('January first'), false)
})
test('does NOT flag "yes please process"', () => {
  assert.equal(detectNonHumanAudio('yes please process'), false)
})
test('does NOT flag "zero one zero one"', () => {
  assert.equal(detectNonHumanAudio('zero one zero one'), false)
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

console.log(`\nResult: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

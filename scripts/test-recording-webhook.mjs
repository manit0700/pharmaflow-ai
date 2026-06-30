#!/usr/bin/env node
/**
 * Simulates a Twilio recording-status callback against a real call job,
 * then verifies the DB saved RecordingSid + RecordingDuration, and that
 * the audio proxy endpoint returns 200.
 *
 * Usage: node scripts/test-recording-webhook.mjs [callJobId]
 *
 * If no callJobId is given, the script picks the most recent job that
 * already has a recordingUrl (so the proxy test is also meaningful).
 */

const API = 'http://localhost:4002'

async function main() {
  // ── 1. Find the target call job ──────────────────────────────────────────
  let jobId = process.argv[2]
  let callSid

  if (!jobId) {
    const jobs = await fetch(`${API}/api/call-jobs`).then((r) => r.json())
    const target = jobs.find((j) => j.recordingUrl)
    if (!target) {
      console.error('SKIP  No call job with recordingUrl found. Run a live call first.')
      process.exit(0)
    }
    jobId = target.id
    callSid = target.twilioCallSid ?? `SIMULATED_SID_${Date.now()}`
    console.log(`Using job: ${jobId.slice(0, 12)}...  (callSid: ${callSid?.slice(0, 16) ?? 'none'})`)
  } else {
    const job = await fetch(`${API}/api/call-jobs/${jobId}`).then((r) => r.json())
    if (!job?.id) { console.error('FAIL  Job not found:', jobId); process.exit(1) }
    callSid = job.twilioCallSid ?? `SIMULATED_SID_${Date.now()}`
  }

  // ── 2. Simulate Twilio recording-status callback ─────────────────────────
  const fakeSid = `RE_TEST_${Date.now()}`
  const fakeDuration = '47'
  const fakeUrl = `https://api.twilio.com/2010-04-01/Accounts/TEST/Recordings/${fakeSid}`

  const params = new URLSearchParams({
    RecordingStatus: 'completed',
    RecordingUrl: fakeUrl,
    RecordingSid: fakeSid,
    RecordingDuration: fakeDuration,
    CallSid: callSid,
  })

  const webhookRes = await fetch(
    `${API}/api/twilio/recording-status?callJobId=${jobId}`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() },
  )

  if (webhookRes.status !== 204) {
    console.error(`FAIL  recording-status webhook returned ${webhookRes.status}`)
    process.exit(1)
  }
  console.log('PASS  recording-status webhook → 204')

  // ── 3. Verify DB fields were saved ───────────────────────────────────────
  const updated = await fetch(`${API}/api/call-jobs/${jobId}`).then((r) => r.json())
  const sidOk = updated.recordingSid === fakeSid
  const durOk = updated.recordingDuration === Number(fakeDuration)
  const urlOk = updated.recordingUrl === `${fakeUrl}.mp3`

  console.log(`${sidOk ? 'PASS' : 'FAIL'}  recordingSid saved  (got: ${updated.recordingSid})`)
  console.log(`${durOk ? 'PASS' : 'FAIL'}  recordingDuration saved  (got: ${updated.recordingDuration})`)
  console.log(`${urlOk ? 'PASS' : 'FAIL'}  recordingUrl saved  (got: ${updated.recordingUrl?.slice(0, 50)}...)`)

  // ── 4. Test audio proxy ──────────────────────────────────────────────────
  // The proxy will fail against a fake URL (Twilio will 404), but we only
  // care that the endpoint itself is wired and reachable (not 404 at the API level).
  const proxyRes = await fetch(`${API}/api/call-jobs/${jobId}/recording/audio`, { method: 'HEAD' })
  // 200 = real Twilio audio, 502 = Twilio returned error (expected with fake URL), 404 = no URL on job
  const proxyOk = proxyRes.status === 200 || proxyRes.status === 502
  console.log(`${proxyOk ? 'PASS' : 'FAIL'}  audio proxy reachable  (status: ${proxyRes.status})`)

  // ── Summary ───────────────────────────────────────────────────────────────
  const allPassed = sidOk && durOk && urlOk && proxyOk
  console.log(`\n${allPassed ? '✓ All checks passed' : '✗ Some checks failed'} — job ${jobId}`)
  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1) })

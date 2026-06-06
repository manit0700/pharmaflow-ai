import { VALID_CALL_REASONS } from '../server/dist/config.js'
import { formatAiPromptForPreview } from '../server/dist/services/callAi.js'

const ctx = {
  pharmacyName: 'Premium Family Pharmacy',
  patientName: 'Jane Doe',
  medicationName: 'Lisinopril 10mg',
}

for (const reason of VALID_CALL_REASONS) {
  console.log(formatAiPromptForPreview(reason, ctx))
  console.log('\n')
}

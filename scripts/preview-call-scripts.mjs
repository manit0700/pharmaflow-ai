import { VALID_CALL_REASONS } from '../server/dist/config.js'
import { formatScriptForPreview } from '../server/dist/services/callScripts.js'

const ctx = {
  pharmacyName: 'Premium Family Pharmacy',
  patientName: 'Jane Doe',
  medicationName: 'Lisinopril 10mg',
}

for (const reason of VALID_CALL_REASONS) {
  console.log(formatScriptForPreview(reason, ctx))
  console.log('\n')
}

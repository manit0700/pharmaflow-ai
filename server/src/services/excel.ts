import * as XLSX from 'xlsx'
import { VALID_CALL_REASONS, type CallReason } from '../config.js'
import { normalizePhone } from './safety.js'

const REQUIRED_COLUMNS = [
  'patient_name',
  'phone_number',
  'dob',
  'medication_name',
  'call_reason',
  'notes',
] as const

export interface ParsedCallRow {
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: CallReason
  notes: string | null
  prescriptionCost: number | null
  prescriptionsJson: string | null
  validationStatus: 'valid' | 'invalid'
  validationError: string | null
}

export interface CallInput {
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: string
  notes?: string | null
  prescriptionCost?: number | null
  prescriptionsJson?: string | null
}

function parsePrescriptions(
  primaryName: string,
  primaryCost: number | null,
  additionalText: string | null,
): { prescriptionsJson: string | null; totalCost: number | null } {
  const all: Array<{ name: string; cost: number }> = []
  if (primaryName) all.push({ name: primaryName, cost: primaryCost ?? 0 })

  if (additionalText) {
    for (const segment of additionalText.split(';')) {
      const s = segment.trim()
      if (!s) continue
      const match = s.match(/^(.+?)\s+\$?([\d.]+)$/)
      if (match) {
        all.push({ name: match[1].trim(), cost: parseFloat(match[2]) })
      } else if (s) {
        all.push({ name: s, cost: 0 })
      }
    }
  }

  if (all.length === 0) return { prescriptionsJson: null, totalCost: null }
  const totalCost = all.some((p) => p.cost > 0) ? all.reduce((sum, p) => sum + p.cost, 0) : null
  return { prescriptionsJson: JSON.stringify(all), totalCost }
}

export function validateCallInput(input: CallInput): ParsedCallRow {
  const errors: string[] = []
  const phone = normalizePhone(input.phoneNumber.trim())
  if (!phone) errors.push('Invalid phone_number')
  if (!input.patientName.trim()) errors.push('patient_name required')
  if (!input.dob.trim()) errors.push('dob required')
  if (!input.medicationName.trim()) errors.push('medication_name required')

  const reason = input.callReason.trim().toLowerCase() as CallReason
  if (!VALID_CALL_REASONS.includes(reason)) {
    errors.push(`call_reason must be one of: ${VALID_CALL_REASONS.join(', ')}`)
  }

  let finalPrescriptionsJson: string | null
  let finalCost: number | null

  if (input.prescriptionsJson) {
    finalPrescriptionsJson = input.prescriptionsJson
    try {
      const rxs = JSON.parse(input.prescriptionsJson) as Array<{ name: string; cost: number }>
      const sum = rxs.reduce((s, r) => s + (r.cost ?? 0), 0)
      finalCost = sum > 0 ? sum : (input.prescriptionCost ?? null)
    } catch {
      finalCost = input.prescriptionCost ?? null
    }
  } else {
    const built = parsePrescriptions(input.medicationName.trim(), input.prescriptionCost ?? null, null)
    finalPrescriptionsJson = built.prescriptionsJson
    finalCost = built.totalCost ?? input.prescriptionCost ?? null
  }

  return {
    patientName: input.patientName.trim() || 'Unknown patient',
    phoneNumber: phone ?? input.phoneNumber.trim(),
    dob: input.dob.trim(),
    medicationName: input.medicationName.trim(),
    callReason: VALID_CALL_REASONS.includes(reason) ? reason : 'general_callback',
    notes: input.notes?.trim() || null,
    prescriptionCost: finalCost,
    prescriptionsJson: finalPrescriptionsJson,
    validationStatus: errors.length ? 'invalid' : 'valid',
    validationError: errors.length ? errors.join('; ') : null,
  }
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

export function parseExcelBuffer(buffer: Buffer): ParsedCallRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) throw new Error('Excel file has no sheets')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (rows.length === 0) throw new Error('Excel file is empty')

  const firstKeys = Object.keys(rows[0]!).map(normalizeHeader)
  for (const col of REQUIRED_COLUMNS) {
    if (!firstKeys.includes(col)) {
      throw new Error(`Missing required column: ${col}`)
    }
  }

  return rows.map((row, index) => {
    const mapped: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      mapped[normalizeHeader(k)] = String(v ?? '').trim()
    }

    const primaryCostRaw = mapped.medication_cost ?? mapped.prescription_cost ?? ''
    const primaryCost = primaryCostRaw
      ? parseFloat(primaryCostRaw.replace(/[^0-9.]/g, '')) || null
      : null
    const additionalText = mapped.additional_prescriptions ?? mapped.prescriptions ?? null

    const { prescriptionsJson, totalCost } = parsePrescriptions(
      mapped.medication_name ?? '',
      primaryCost,
      additionalText || null,
    )

    return validateCallInput({
      patientName: mapped.patient_name || `Patient ${index + 1}`,
      phoneNumber: mapped.phone_number ?? '',
      dob: mapped.dob,
      medicationName: mapped.medication_name,
      callReason: mapped.call_reason ?? '',
      notes: mapped.notes || null,
      prescriptionCost: totalCost,
      prescriptionsJson,
    })
  })
}

export function buildExportWorkbook(
  jobs: {
    patientName: string
    phoneNumber: string
    dob: string
    medicationName: string
    callReason: string
    notes: string | null
    validationStatus: string
    callStatus: string
    patientResponse: string | null
    aiSummary: string | null
    staffFollowUpNeeded: boolean
    followUpReason: string | null
  }[],
): Buffer {
  const data = jobs.map((j) => ({
    patient_name: j.patientName,
    phone_number: j.phoneNumber,
    dob: j.dob,
    medication_name: j.medicationName,
    call_reason: j.callReason,
    notes: j.notes ?? '',
    validation_status: j.validationStatus,
    call_status: j.callStatus,
    patient_response: j.patientResponse ?? '',
    ai_summary: j.aiSummary ?? '',
    staff_follow_up: j.staffFollowUpNeeded ? 'yes' : 'no',
    follow_up_reason: j.followUpReason ?? '',
  }))
  const sheet = XLSX.utils.json_to_sheet(data)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'call_results')
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
}

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

  return {
    patientName: input.patientName.trim() || 'Unknown patient',
    phoneNumber: phone ?? input.phoneNumber.trim(),
    dob: input.dob.trim(),
    medicationName: input.medicationName.trim(),
    callReason: VALID_CALL_REASONS.includes(reason) ? reason : 'general_callback',
    notes: input.notes?.trim() || null,
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

    return validateCallInput({
      patientName: mapped.patient_name || `Patient ${index + 1}`,
      phoneNumber: mapped.phone_number ?? '',
      dob: mapped.dob,
      medicationName: mapped.medication_name,
      callReason: mapped.call_reason ?? '',
      notes: mapped.notes || null,
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

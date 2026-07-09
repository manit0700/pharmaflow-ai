import * as XLSX from 'xlsx'
import { VALID_CALL_REASONS, type CallReason } from '../config.js'
import { normalizePhone } from './safety.js'

// Maps stripped column keys (lowercase, no separators) → internal snake_case name
const COLUMN_ALIASES: Record<string, string> = {
  // Patient name — separate first/last always preferred over combined
  patientname: 'patient_name',
  patientfirstname: '_first_name',
  firstname: '_first_name',
  patientlastname: '_last_name',
  lastname: '_last_name',
  name: 'patient_name',
  // Phone — cell phone keyed separately so it wins over home phone
  patientphone: 'phone_number',
  homephone: 'phone_number',
  phone: 'phone_number',
  phonenumber: 'phone_number',
  patientcell: 'cell_phone',
  cellphone: 'cell_phone',
  mobile: 'cell_phone',
  // DOB
  patientdob: 'dob',
  dateofbirth: 'dob',
  birthdate: 'dob',
  dob: 'dob',
  // Drug / medication
  drugname: 'medication_name',
  drug: 'medication_name',
  medicationname: 'medication_name',
  medication: 'medication_name',
  genericfor: 'generic_for',
  // Rx identifier
  rxnumber: 'rx_number',
  rxno: 'rx_number',
  prescriptionnumber: 'rx_number',
  // Cost — patient pay is the copay shown to patient
  patpay: 'medication_cost',
  patientpay: 'medication_cost',
  rxcost: 'rx_cost',
  aaccost: 'aac_cost',
  medicationcost: 'medication_cost',
  prescriptioncost: 'medication_cost',
  // Refill info → stored in notes
  rxqty: 'rx_qty',
  quantity: 'rx_qty',
  qty: 'rx_qty',
  refills: 'refills',
  refillsremaining: 'refills',
  dayssupply: 'days_supply',
  dayssup: 'days_supply',
  // Doctor
  doctorname: 'doctor_name',
  prescribername: 'doctor_name',
  physician: 'doctor_name',
  rph: 'rph',
  // Dates
  rxdate: 'rx_date',
  filldate: 'rx_date',
  nextfilldate: 'next_fill_date',
  duedate: 'next_fill_date',
  nextfill: 'next_fill_date',
  // Notes / comments
  rxcomment: 'notes',
  rxnotes: 'notes',
  patientnotes: 'notes',
  comment: 'notes',
  comments: 'notes',
  // Call reason
  callreason: 'call_reason',
  reason: 'call_reason',
  // Address → stored in notes
  patientstreet: 'address_street',
  patientaddress: 'address_street',
  address: 'address_street',
  patientcity: 'address_city',
  city: 'address_city',
  patientstate: 'address_state',
  state: 'address_state',
  patientzip: 'address_zip',
  zip: 'address_zip',
  zipcode: 'address_zip',
  postalcode: 'address_zip',
  // Additional prescriptions (standard format)
  additionalprescriptions: 'additional_prescriptions',
  prescriptions: 'additional_prescriptions',
}

export interface ParsedCallRow {
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: CallReason
  notes: string | null
  prescriptionCost: number | null
  prescriptionsJson: string | null
  rxNumber: string | null
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
  rxNumber?: string | null
}

function excelDateToString(v: unknown): string {
  if (v instanceof Date) {
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${m}/${d}/${v.getFullYear()}`
  }
  // Excel serial number — convert via xlsx
  if (typeof v === 'number' && v > 0 && v < 200000) {
    const date = XLSX.SSF.parse_date_code(v)
    if (date && date.y > 1900) {
      const m = String(date.m).padStart(2, '0')
      const d = String(date.d).padStart(2, '0')
      return `${m}/${d}/${date.y}`
    }
  }
  return String(v ?? '').trim()
}

function parsePrescriptions(
  primaryName: string,
  primaryCost: number | null,
  additionalText: string | null,
  primaryRxNumber?: string | null,
): { prescriptionsJson: string | null; totalCost: number | null } {
  const all: Array<{ name: string; rxNumber?: string; cost: number }> = []
  if (primaryName) {
    const entry: { name: string; rxNumber?: string; cost: number } = { name: primaryName, cost: primaryCost ?? 0 }
    if (primaryRxNumber) entry.rxNumber = primaryRxNumber
    all.push(entry)
  }

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
    rxNumber: input.rxNumber?.trim() || null,
    validationStatus: errors.length ? 'invalid' : 'valid',
    validationError: errors.length ? errors.join('; ') : null,
  }
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

function stripKey(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]/g, '')
}

// Convert pharmacy "LASTNAME,FIRSTNAME" → "Firstname Lastname" in Title Case
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function resolvePatientName(mapped: Record<string, string>): string {
  // Prefer explicit first/last columns (cleaner, correct order)
  const first = mapped._first_name?.trim()
  const last = mapped._last_name?.trim()
  if (first || last) return toTitleCase([first, last].filter(Boolean).join(' '))

  // Fall back to combined column — handle "LAST,FIRST" pharmacy format
  const raw = mapped.patient_name?.trim() || ''
  if (!raw) return ''
  if (raw.includes(',')) {
    const commaIdx = raw.indexOf(',')
    const lastPart = raw.slice(0, commaIdx).trim()
    const firstPart = raw.slice(commaIdx + 1).trim()
    return toTitleCase([firstPart, lastPart].filter(Boolean).join(' '))
  }
  return toTitleCase(raw)
}

export function parseExcelBuffer(buffer: Buffer): ParsedCallRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) throw new Error('Excel file has no sheets')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (rows.length === 0) throw new Error('Excel file is empty')

  const parsed = rows.map((row, index) => {
    // Build mapped: apply alias mapping so pharmacy system columns are recognized
    const mapped: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      // Date cells come as JS Date objects when cellDates:true; convert to MM/DD/YYYY
      const val = v instanceof Date ? excelDateToString(v) : String(v ?? '').trim()
      const normalized = normalizeHeader(k)
      const aliasTarget = COLUMN_ALIASES[stripKey(k)] ?? COLUMN_ALIASES[normalized.replace(/_/g, '')]
      if (aliasTarget) {
        // Only set alias target if not already set (first matching column wins)
        if (!mapped[aliasTarget]) mapped[aliasTarget] = val
      } else {
        mapped[normalized] = val
      }
    }

    // Resolve name — handles LAST,FIRST format and prefers separate first/last columns
    const patientName = resolvePatientName(mapped)

    // Cell phone wins over home phone for outbound calls
    const phone = mapped.cell_phone || mapped.phone_number || ''

    // Cost priority: patient pay > rx_cost > aac_cost
    const costRaw = mapped.medication_cost || mapped.rx_cost || mapped.aac_cost || ''
    const primaryCost = costRaw ? parseFloat(costRaw.replace(/[^0-9.]/g, '')) || null : null

    // Build notes from extra pharmacy metadata fields
    const notesParts: string[] = []
    if (mapped.notes) notesParts.push(mapped.notes)
    if (mapped.doctor_name) notesParts.push(`Dr: ${mapped.doctor_name}`)
    if (mapped.rx_qty) notesParts.push(`Qty: ${mapped.rx_qty}`)
    if (mapped.refills) notesParts.push(`Refills: ${mapped.refills}`)
    if (mapped.days_supply) notesParts.push(`Days supply: ${mapped.days_supply}`)
    if (mapped.rph) notesParts.push(`RPH: ${mapped.rph}`)
    if (mapped.next_fill_date) notesParts.push(`Next fill: ${mapped.next_fill_date}`)
    const addrParts = [mapped.address_street, mapped.address_city, mapped.address_state, mapped.address_zip].filter(Boolean)
    if (addrParts.length) notesParts.push(`Address: ${addrParts.join(', ')}`)
    const builtNotes = notesParts.length ? notesParts.join(' | ') : null

    const medName = mapped.medication_name || mapped.generic_for || ''
    const additionalText = mapped.additional_prescriptions || null

    const { prescriptionsJson, totalCost } = parsePrescriptions(medName, primaryCost, additionalText, mapped.rx_number || null)

    // Default call_reason to refill_reminder for pharmacy system exports
    const callReason = mapped.call_reason || 'refill_reminder'

    return validateCallInput({
      patientName: patientName || `Patient ${index + 1}`,
      phoneNumber: phone,
      dob: mapped.dob || '',
      medicationName: medName,
      callReason,
      notes: builtNotes,
      prescriptionCost: totalCost,
      prescriptionsJson,
      rxNumber: mapped.rx_number || null,
    })
  })

  return mergeByPatient(parsed)
}

type RxEntry = { name: string; rxNumber?: string; cost: number }

function mergeByPatient(rows: ParsedCallRow[]): ParsedCallRow[] {
  const order: string[] = []
  const groups = new Map<string, ParsedCallRow[]>()

  for (const row of rows) {
    const key = row.phoneNumber.replace(/\D/g, '') || row.patientName.toLowerCase()
    if (!groups.has(key)) { groups.set(key, []); order.push(key) }
    groups.get(key)!.push(row)
  }

  return order.map((key) => {
    const group = groups.get(key)!
    if (group.length === 1) return group[0]!

    // Merge all prescriptions from every row into one array
    const allRx: RxEntry[] = []
    for (const row of group) {
      if (row.prescriptionsJson) {
        try {
          const rxs = JSON.parse(row.prescriptionsJson) as RxEntry[]
          allRx.push(...rxs)
        } catch { /* skip */ }
      } else if (row.medicationName) {
        allRx.push({ name: row.medicationName, rxNumber: row.rxNumber ?? undefined, cost: row.prescriptionCost ?? 0 })
      }
    }

    const totalCost = allRx.some((r) => r.cost > 0) ? allRx.reduce((s, r) => s + r.cost, 0) : null
    const base = group[0]!

    return {
      ...base,
      medicationName: allRx.map((r) => r.name).join(', '),
      prescriptionsJson: allRx.length > 0 ? JSON.stringify(allRx) : null,
      prescriptionCost: totalCost,
      rxNumber: null, // individual rx numbers are inside prescriptionsJson
    }
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

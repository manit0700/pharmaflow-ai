import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { fetchCallJobs } from '@/utils/api'

interface PreviewRow {
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: string
  notes: string
  duplicate: boolean
}

const COLUMN_ALIASES: Record<string, string> = {
  patientname: 'patient_name', patientfirstname: '_first_name', firstname: '_first_name',
  patientlastname: '_last_name', lastname: '_last_name', name: 'patient_name',
  patientphone: 'phone_number', patientcell: 'phone_number', cellphone: 'phone_number',
  phone: 'phone_number', phonenumber: 'phone_number', mobile: 'phone_number',
  patientdob: 'dob', dateofbirth: 'dob', birthdate: 'dob',
  drugname: 'medication_name', drug: 'medication_name', medicationname: 'medication_name',
  medication: 'medication_name', genericfor: 'medication_name',
  rxnumber: 'rx_number', rxno: 'rx_number', prescriptionnumber: 'rx_number',
  patpay: 'medication_cost', patientpay: 'medication_cost', rxcost: 'medication_cost',
  aaccost: 'medication_cost', medicationcost: 'medication_cost',
  doctorname: 'doctor_name', prescribername: 'doctor_name', physician: 'doctor_name',
  callreason: 'call_reason', reason: 'call_reason',
  rxcomment: 'notes', rxnotes: 'notes', patientnotes: 'notes', comment: 'notes', comments: 'notes',
  rxqty: 'rx_qty', quantity: 'rx_qty', qty: 'rx_qty',
  refills: 'refills', refillsremaining: 'refills',
  dayssupply: 'days_supply', nextfilldate: 'next_fill_date',
  rph: 'rph', rxdate: 'rx_date',
  patientstreet: 'address_street', patientcity: 'address_city',
  patientstate: 'address_state', patientzip: 'address_zip',
}

function stripKey(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]/g, '')
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
}

function parseWorkbook(buffer: ArrayBuffer, duplicatePhones: Set<string>): PreviewRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) throw new Error('Excel file has no sheets')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (rows.length === 0) throw new Error('Excel file is empty')

  return rows.map((row) => {
    const mapped: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      const val = String(v ?? '').trim()
      const aliasTarget = COLUMN_ALIASES[stripKey(k)]
      const target = aliasTarget ?? k.trim().toLowerCase().replace(/\s+/g, '_')
      if (!mapped[target]) mapped[target] = val
    }

    // Combine first + last name if full name not present
    if (!mapped.patient_name) {
      const combined = [mapped._first_name, mapped._last_name].filter(Boolean).join(' ')
      if (combined) mapped.patient_name = combined
    }

    // Build notes from metadata fields
    const noteParts: string[] = []
    if (mapped.notes) noteParts.push(mapped.notes)
    if (mapped.doctor_name) noteParts.push(`Dr: ${mapped.doctor_name}`)
    if (mapped.rx_qty) noteParts.push(`Qty: ${mapped.rx_qty}`)
    if (mapped.refills) noteParts.push(`Refills: ${mapped.refills}`)
    if (mapped.days_supply) noteParts.push(`Days: ${mapped.days_supply}`)
    if (mapped.next_fill_date) noteParts.push(`Next fill: ${mapped.next_fill_date}`)

    const phone = mapped.phone_number ?? ''
    return {
      patientName: mapped.patient_name ?? '',
      phoneNumber: phone,
      dob: mapped.dob ?? '',
      medicationName: mapped.medication_name ?? '',
      callReason: mapped.call_reason || 'refill_reminder',
      notes: noteParts.join(' | '),
      duplicate: duplicatePhones.has(normalizePhone(phone)),
    }
  })
}

export function ImportPreviewDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File | null
  onCancel: () => void
  onConfirm: (file: File) => void
}) {
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  useEffect(() => {
    if (!file) return
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setRows([])
      setError(null)
      setParsing(true)
      file
        .arrayBuffer()
        .then(async (buf) => {
          if (cancelled) return
          const jobs = await fetchCallJobs().catch(() => [])
          const duplicatePhones = new Set(
            jobs
              .filter((job) => !['failed', 'canceled'].includes(job.callStatus))
              .map((job) => normalizePhone(job.phoneNumber)),
          )
          setRows(parseWorkbook(buf, duplicatePhones))
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setError(e instanceof Error ? e.message : 'Could not read Excel file')
        })
        .finally(() => {
          if (!cancelled) setParsing(false)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [file])

  const duplicateCount = rows.filter((row) => row.duplicate).length

  return (
    <Dialog.Root open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background shadow-lg">
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold">Review import</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {parsing
                  ? 'Reading file…'
                  : error
                    ? 'Could not read this file'
                    : `${rows.length} row${rows.length === 1 ? '' : 's'} found — review before importing`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : parsing ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Parsing spreadsheet…</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No rows found in this file.</p>
            ) : (
              <div className="space-y-3">
                {duplicateCount > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {duplicateCount} row{duplicateCount === 1 ? '' : 's'} may be duplicates of existing patients.
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                      <th className="pb-2 pr-4">Patient Name</th>
                      <th className="pb-2 pr-4">Phone</th>
                      <th className="pb-2 pr-4">Duplicate</th>
                      <th className="pb-2 pr-4">DOB</th>
                      <th className="pb-2 pr-4">Medication</th>
                      <th className="pb-2 pr-4">Reason</th>
                      <th className="pb-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-4 font-medium">{row.patientName || '—'}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{row.phoneNumber || '—'}</td>
                        <td className="py-1.5 pr-4">
                          {row.duplicate ? <Badge variant="warning">Duplicate</Badge> : '—'}
                        </td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{row.dob || '—'}</td>
                        <td className="py-1.5 pr-4">{row.medicationName || '—'}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{row.callReason || '—'}</td>
                        <td className="py-1.5 text-muted-foreground">{row.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={parsing || !!error || rows.length === 0 || !file}
              onClick={() => file && onConfirm(file)}
            >
              Import all
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

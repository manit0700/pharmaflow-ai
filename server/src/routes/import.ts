import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma.js'
import { parseExcelBuffer } from '../services/excel.js'
import { normalizePhone } from '../services/safety.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

export const importRouter = Router()

async function safetyForRow(row: { phoneNumber: string; dob: string; medicationName: string }) {
  const phoneNumber = normalizePhone(row.phoneNumber) ?? row.phoneNumber
  const [dnc, duplicate] = await Promise.all([
    prisma.doNotCallEntry.findUnique({ where: { phoneNumber } }).catch(() => null),
    prisma.callJob
      .findFirst({
        where: {
          phoneNumber,
          dob: row.dob,
          medicationName: row.medicationName,
          callStatus: { notIn: ['completed', 'resolved', 'cancelled'] },
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => null),
  ])
  const flags = [
    ...(dnc ? [`Do-not-call: ${dnc.reason ?? 'listed number'}`] : []),
    ...(duplicate ? [`Possible duplicate of ${duplicate.patientName}`] : []),
  ]
  return { dnc, duplicate, flags }
}

importRouter.post('/import/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use field name "file".' })
      return
    }

    const parsed = parseExcelBuffer(req.file.buffer)
    const batch = await prisma.uploadBatch
      .create({
        data: {
          filename: req.file.originalname || 'uploaded-call-list.xlsx',
          imported: parsed.length,
          valid: 0,
          invalid: 0,
          duplicateCount: 0,
        },
      })
      .catch(() => null)
    let duplicateCount = 0
    const created = await Promise.all(
      parsed.map(async (row) => {
        const safety = await safetyForRow(row)
        if (safety.duplicate) duplicateCount += 1
        return prisma.callJob.create({
          data: {
            uploadBatchId: batch?.id ?? null,
            patientName: row.patientName,
            phoneNumber: row.phoneNumber,
            dob: row.dob,
            medicationName: row.medicationName,
            callReason: row.callReason,
            notes: row.notes,
            validationStatus: safety.dnc ? 'invalid' : row.validationStatus,
            validationError: safety.dnc ? safety.flags[0] : row.validationError,
            callStatus: safety.dnc ? 'blocked' : row.validationStatus === 'valid' ? 'queued' : 'invalid',
            doNotCall: Boolean(safety.dnc),
            duplicateOfId: safety.duplicate?.id ?? null,
            safetyFlagsJson: safety.flags.length ? JSON.stringify(safety.flags) : null,
          },
        })
      }),
    )
    if (batch) {
      await prisma.uploadBatch
        .update({
          where: { id: batch.id },
          data: {
            valid: created.filter((j) => j.validationStatus === 'valid').length,
            invalid: created.filter((j) => j.validationStatus === 'invalid').length,
            duplicateCount,
          },
        })
        .catch(() => null)
    }

    res.json({
      imported: created.length,
      valid: created.filter((j) => j.validationStatus === 'valid').length,
      invalid: created.filter((j) => j.validationStatus === 'invalid').length,
      batchId: batch?.id ?? null,
      jobs: created,
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Import failed' })
  }
})

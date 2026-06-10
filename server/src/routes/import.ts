import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma.js'
import { parseExcelBuffer } from '../services/excel.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

export const importRouter = Router()

importRouter.post('/import/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use field name "file".' })
      return
    }

    const parsed = parseExcelBuffer(req.file.buffer)
    const created = await Promise.all(
      parsed.map((row) =>
        prisma.callJob.create({
          data: {
            patientName: row.patientName,
            phoneNumber: row.phoneNumber,
            dob: row.dob,
            medicationName: row.medicationName,
            callReason: row.callReason,
            notes: row.notes,
            validationStatus: row.validationStatus,
            validationError: row.validationError,
            callStatus: row.validationStatus === 'valid' ? 'queued' : 'invalid',
          },
        }),
      ),
    )

    res.json({
      imported: created.length,
      valid: created.filter((j) => j.validationStatus === 'valid').length,
      invalid: created.filter((j) => j.validationStatus === 'invalid').length,
      jobs: created,
    })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Import failed' })
  }
})

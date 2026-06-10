import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const jobs = [
  {
    patientName: 'Maria Lopez',
    phoneNumber: '+15551234001',
    dob: '1968-03-12',
    medicationName: 'Lisinopril 10mg',
    callReason: 'refill_reminder',
    notes: 'Due in 3 days',
    validationStatus: 'valid',
    callStatus: 'queued',
  },
  {
    patientName: 'James Chen',
    phoneNumber: '+15551234002',
    dob: '1975-11-02',
    medicationName: 'Metformin 500mg',
    callReason: 'pickup_reminder',
    notes: 'Ready since yesterday',
    validationStatus: 'valid',
    callStatus: 'queued',
  },
]

await prisma.callEvent.deleteMany()
await prisma.staffTask.deleteMany()
await prisma.callJob.deleteMany()
await prisma.inboundCall.deleteMany()

for (const j of jobs) {
  await prisma.callJob.create({ data: j })
}

console.log('Seeded', jobs.length, 'call jobs')
await prisma.$disconnect()

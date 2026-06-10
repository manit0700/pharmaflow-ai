import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.callEvent.deleteMany()
  await prisma.staffTask.deleteMany()
  await prisma.callJob.deleteMany()
  await prisma.inboundCall.deleteMany()

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
    {
      patientName: 'Patricia Wells',
      phoneNumber: 'invalid',
      dob: '1980-01-20',
      medicationName: 'Atorvastatin 20mg',
      callReason: 'general_callback',
      notes: 'Bad phone for demo validation',
      validationStatus: 'invalid',
      validationError: 'Invalid phone_number',
      callStatus: 'invalid',
    },
  ]

  for (const j of jobs) {
    await prisma.callJob.create({ data: j })
  }

  console.log('Seeded', jobs.length, 'call jobs')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

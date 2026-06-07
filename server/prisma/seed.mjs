import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const jobs = [
  {
    patientName: 'Maria Test',
    phoneNumber: '+15551234001',
    dob: '01/01/1980',
    medicationName: 'Medication A',
    callReason: 'refill_reminder',
    notes: 'Fake demo refill row',
    validationStatus: 'valid',
    callStatus: 'completed',
    patientResponse: 'Confirmed refill request',
    aiSummary: 'Demo patient confirmed refill request. No clinical advice provided.',
    aiConfidence: 0.94,
    resolutionStatus: 'resolved',
  },
  {
    patientName: 'James Test',
    phoneNumber: '+15551234002',
    dob: '02/02/1975',
    medicationName: 'Medication B',
    callReason: 'pickup_reminder',
    notes: 'Fake demo pickup row',
    validationStatus: 'valid',
    callStatus: 'no_answer',
    patientResponse: null,
    aiSummary: 'No answer. Safe voicemail message was used.',
    aiConfidence: 0.82,
    staffFollowUpNeeded: true,
    followUpReason: 'Retry tomorrow after 2 PM',
  },
]

await prisma.auditEvent.deleteMany()
await prisma.taskActivity.deleteMany()
await prisma.callEvent.deleteMany()
await prisma.staffTask.deleteMany()
await prisma.callJob.deleteMany()
await prisma.inboundCall.deleteMany()

const [refillJob, pickupJob] = await Promise.all(jobs.map((j) => prisma.callJob.create({ data: j })))

const reviewTask = await prisma.staffTask.create({
  data: {
    callJobId: pickupJob.id,
    patientName: 'J. Test',
    phoneNumber: '(***) ***-4002',
    medicationName: 'Medication B',
    taskType: 'no_answer',
    priority: 'medium',
    status: 'open',
    notes: 'Demo task from no-answer call.',
    aiSummary: 'No answer; retry recommended.',
    assignedTeam: 'Front Desk',
    dueDate: new Date().toISOString().slice(0, 10),
    dueTime: '14:00',
    sourceWorkflow: 'Prescription Pickup',
    issueSummary: 'No answer on pickup reminder.',
    activityJson: JSON.stringify([
      {
        id: 'seed-activity-1',
        type: 'created',
        actor: 'workflow-engine',
        message: 'Task created from demo no-answer call.',
        timestamp: new Date().toISOString(),
      },
    ]),
  },
})

await prisma.taskActivity.createMany({
  data: [
    {
      taskId: reviewTask.id,
      activityType: 'task_created',
      message: 'Task created from demo no-answer call.',
      actor: 'workflow-engine',
      metadataJson: JSON.stringify({ callJobId: pickupJob.id }),
    },
    {
      taskId: reviewTask.id,
      activityType: 'assignment',
      message: 'Assigned to Front Desk for retry.',
      actor: 'workflow-engine',
      metadataJson: JSON.stringify({ assignedTeam: 'Front Desk' }),
    },
  ],
})

await prisma.auditEvent.createMany({
  data: [
    {
      entityType: 'call_job',
      entityId: refillJob.id,
      action: 'CALL_SEEDED',
      actor: 'seed',
      message: 'Seeded fake completed refill reminder call.',
      metadataJson: JSON.stringify({ callReason: refillJob.callReason }),
    },
    {
      entityType: 'staff_task',
      entityId: reviewTask.id,
      action: 'TASK_SEEDED',
      actor: 'seed',
      message: 'Seeded fake follow-up task.',
      metadataJson: JSON.stringify({ taskType: reviewTask.taskType }),
    },
  ],
})

console.log('Seeded', jobs.length, 'call jobs and 1 follow-up task')
await prisma.$disconnect()

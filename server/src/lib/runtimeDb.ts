import { prisma } from './prisma.js'

let initialized: Promise<void> | null = null

async function ignoreDuplicateColumn(sql: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(sql)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('duplicate column name')) throw err
  }
}

async function initializeSqliteRuntimeDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CallJob" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "patientName" TEXT NOT NULL,
      "phoneNumber" TEXT NOT NULL,
      "dob" TEXT NOT NULL,
      "medicationName" TEXT NOT NULL,
      "callReason" TEXT NOT NULL,
      "notes" TEXT,
      "validationStatus" TEXT NOT NULL DEFAULT 'pending',
      "validationError" TEXT,
      "callStatus" TEXT NOT NULL DEFAULT 'queued',
      "twilioCallSid" TEXT,
      "callAttemptedAt" DATETIME,
      "callCompletedAt" DATETIME,
      "callDuration" INTEGER,
      "patientResponse" TEXT,
      "aiSummary" TEXT,
      "errorMessage" TEXT,
      "transcriptJson" TEXT,
      "messagesJson" TEXT,
      "aiConfidence" REAL,
      "resolutionStatus" TEXT,
      "staffFollowUpNeeded" BOOLEAN NOT NULL DEFAULT false,
      "followUpReason" TEXT,
      "smsStatus" TEXT NOT NULL DEFAULT 'none',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StaffTask" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "callJobId" TEXT,
      "patientName" TEXT NOT NULL,
      "phoneNumber" TEXT NOT NULL,
      "medicationName" TEXT,
      "taskType" TEXT NOT NULL,
      "priority" TEXT NOT NULL DEFAULT 'normal',
      "status" TEXT NOT NULL DEFAULT 'open',
      "notes" TEXT,
      "aiSummary" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "InboundCall" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "callerPhone" TEXT NOT NULL,
      "intent" TEXT,
      "patientName" TEXT,
      "dob" TEXT,
      "medicationName" TEXT,
      "transcript" TEXT,
      "summary" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "handoffReason" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CallEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "callJobId" TEXT,
      "twilioCallSid" TEXT,
      "eventType" TEXT NOT NULL,
      "eventPayload" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "errorMessage" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "transcriptJson" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "messagesJson" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "aiConfidence" REAL')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "resolutionStatus" TEXT')
}

export function shouldInitializeRuntimeDb(): boolean {
  return process.env.VERCEL === '1' && (process.env.DATABASE_URL ?? '').startsWith('file:')
}

export function ensureRuntimeDb(): Promise<void> {
  if (!shouldInitializeRuntimeDb()) return Promise.resolve()
  initialized ??= initializeSqliteRuntimeDb()
  return initialized
}

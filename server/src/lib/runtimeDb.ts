import { prisma } from './prisma.js'

let initialized: Promise<void> | null = null

async function ignoreDuplicateColumn(sql: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(sql)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('duplicate column name') && !message.includes('already exists')) throw err
  }
}

async function initializeSqliteRuntimeDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CallJob" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "uploadBatchId" TEXT,
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
      "resolvedAt" DATETIME,
      "resolvedBy" TEXT,
      "staffNotes" TEXT,
      "safetyFlagsJson" TEXT,
      "duplicateOfId" TEXT,
      "doNotCall" BOOLEAN NOT NULL DEFAULT false,
      "staffFollowUpNeeded" BOOLEAN NOT NULL DEFAULT false,
      "followUpReason" TEXT,
      "smsStatus" TEXT NOT NULL DEFAULT 'none',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UploadBatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "imported" INTEGER NOT NULL DEFAULT 0,
      "valid" INTEGER NOT NULL DEFAULT 0,
      "invalid" INTEGER NOT NULL DEFAULT 0,
      "duplicateCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DoNotCallEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "phoneNumber" TEXT NOT NULL UNIQUE,
      "patientName" TEXT,
      "reason" TEXT,
      "createdBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "uploadBatchId" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "resolvedAt" DATETIME')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "resolvedBy" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "staffNotes" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "safetyFlagsJson" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "duplicateOfId" TEXT')
  await ignoreDuplicateColumn('ALTER TABLE "CallJob" ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false')
}

async function initializePostgresRuntimeDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UploadBatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "imported" INTEGER NOT NULL DEFAULT 0,
      "valid" INTEGER NOT NULL DEFAULT 0,
      "invalid" INTEGER NOT NULL DEFAULT 0,
      "duplicateCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CallJob" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "uploadBatchId" TEXT,
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
      "callAttemptedAt" TIMESTAMP(3),
      "callCompletedAt" TIMESTAMP(3),
      "callDuration" INTEGER,
      "patientResponse" TEXT,
      "aiSummary" TEXT,
      "errorMessage" TEXT,
      "transcriptJson" TEXT,
      "messagesJson" TEXT,
      "aiConfidence" DOUBLE PRECISION,
      "resolutionStatus" TEXT,
      "resolvedAt" TIMESTAMP(3),
      "resolvedBy" TEXT,
      "staffNotes" TEXT,
      "safetyFlagsJson" TEXT,
      "duplicateOfId" TEXT,
      "doNotCall" BOOLEAN NOT NULL DEFAULT false,
      "staffFollowUpNeeded" BOOLEAN NOT NULL DEFAULT false,
      "followUpReason" TEXT,
      "smsStatus" TEXT NOT NULL DEFAULT 'none',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DoNotCallEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "phoneNumber" TEXT NOT NULL UNIQUE,
      "patientName" TEXT,
      "reason" TEXT,
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CallEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "callJobId" TEXT,
      "twilioCallSid" TEXT,
      "eventType" TEXT NOT NULL,
      "eventPayload" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CallJob_phoneNumber_idx" ON "CallJob" ("phoneNumber")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CallJob_twilioCallSid_idx" ON "CallJob" ("twilioCallSid")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CallEvent_callJobId_idx" ON "CallEvent" ("callJobId")')
}

export function shouldInitializeRuntimeDb(): boolean {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  return process.env.VERCEL === '1' && (databaseUrl.startsWith('file:') || /^postgres(?:ql)?:\/\//i.test(databaseUrl))
}

export function ensureRuntimeDb(): Promise<void> {
  if (!shouldInitializeRuntimeDb()) return Promise.resolve()
  const databaseUrl = process.env.DATABASE_URL ?? ''
  initialized ??= /^postgres(?:ql)?:\/\//i.test(databaseUrl)
    ? initializePostgresRuntimeDb()
    : initializeSqliteRuntimeDb()
  return initialized
}

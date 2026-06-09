import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverRoot = path.join(root, 'server')

function loadServerEnv() {
  const localConfigPath = path.join(serverRoot, 'local.config.json')
  const envPath = path.join(serverRoot, '.env')

  if (fs.existsSync(localConfigPath)) {
    const parsed = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (value == null || value === '') continue
      process.env[key] = typeof value === 'string' ? value : String(value)
    }
    return
  }

  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  }
}

function resolveDatabaseUrl() {
  for (const key of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL']) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

function resolveSqliteDatabaseUrl(rawUrl) {
  const url = (rawUrl ?? 'file:./dev.db').trim()
  if (!url.startsWith('file:')) return url
  const filePath = url.slice('file:'.length)
  if (path.isAbsolute(filePath)) return url
  return `file:${path.resolve(serverRoot, filePath)}`
}

loadServerEnv()

let databaseUrl = resolveDatabaseUrl()
const isPostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl)
if (isPostgres && !process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = databaseUrl
}
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = resolveSqliteDatabaseUrl()
} else if (!isPostgres && process.env.DATABASE_URL.startsWith('file:')) {
  process.env.DATABASE_URL = resolveSqliteDatabaseUrl(process.env.DATABASE_URL)
}

const schema = path.join(root, isPostgres ? 'server/prisma/schema.postgres.prisma' : 'server/prisma/schema.prisma')
const action = process.argv[2] ?? 'check'

function run(args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

async function runSqliteRuntimeMigration() {
  const clientPath = path.join(root, 'server/node_modules/@prisma/client/index.js')
  const { PrismaClient } = await import(pathToFileURL(clientPath).href)
  const prisma = new PrismaClient()

  async function exec(sql) {
    await prisma.$executeRawUnsafe(sql)
  }

  async function addColumn(sql) {
    try {
      await exec(sql)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('duplicate column name')) throw err
    }
  }

  await exec(`
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
      "parentCallJobId" TEXT,
      "retryOfCallJobId" TEXT,
      "retryAttempt" INTEGER NOT NULL DEFAULT 0,
      "maxRetryAttempts" INTEGER NOT NULL DEFAULT 3,
      "scheduledFor" DATETIME,
      "retryReason" TEXT,
      "retryStatus" TEXT NOT NULL DEFAULT 'none',
      "createdFromOutcome" TEXT,
      "relatedTaskId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)

  await exec(`
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

  await exec(`
    CREATE TABLE IF NOT EXISTS "DoNotCallEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "phoneNumber" TEXT NOT NULL UNIQUE,
      "patientName" TEXT,
      "reason" TEXT,
      "createdBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await exec(`
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
      "assignedTeam" TEXT NOT NULL DEFAULT 'Unassigned',
      "dueDate" TEXT,
      "dueTime" TEXT NOT NULL DEFAULT '15:00',
      "sourceWorkflow" TEXT,
      "issueSummary" TEXT,
      "activityJson" TEXT,
      "completedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)

  await exec(`
    CREATE TABLE IF NOT EXISTS "TaskActivity" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "activityType" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "actor" TEXT NOT NULL DEFAULT 'system',
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await exec(`
    CREATE TABLE IF NOT EXISTS "AuditEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT,
      "action" TEXT NOT NULL,
      "actor" TEXT NOT NULL DEFAULT 'system',
      "message" TEXT NOT NULL,
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await exec(`
    CREATE TABLE IF NOT EXISTS "CallEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "callJobId" TEXT,
      "twilioCallSid" TEXT,
      "eventType" TEXT NOT NULL,
      "eventPayload" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await exec(`
    CREATE TABLE IF NOT EXISTS "InboundCall" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "twilioCallSid" TEXT,
      "fromNumber" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'open',
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `)

  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "assignedTeam" TEXT NOT NULL DEFAULT \'Unassigned\'')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "dueDate" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "dueTime" TEXT NOT NULL DEFAULT \'15:00\'')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "sourceWorkflow" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "issueSummary" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "activityJson" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "completedAt" DATETIME')

  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "parentCallJobId" TEXT')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "retryOfCallJobId" TEXT')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "retryAttempt" INTEGER NOT NULL DEFAULT 0')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "maxRetryAttempts" INTEGER NOT NULL DEFAULT 3')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "scheduledFor" DATETIME')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "retryReason" TEXT')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "retryStatus" TEXT NOT NULL DEFAULT \'none\'')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "createdFromOutcome" TEXT')
  await addColumn('ALTER TABLE "CallJob" ADD COLUMN "relatedTaskId" TEXT')

  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_status_idx" ON "StaffTask" ("status")')
  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_priority_idx" ON "StaffTask" ("priority")')
  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_dueDate_idx" ON "StaffTask" ("dueDate")')
  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_callJobId_idx" ON "StaffTask" ("callJobId")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_callStatus_idx" ON "CallJob" ("callStatus")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_twilioCallSid_idx" ON "CallJob" ("twilioCallSid")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_createdAt_idx" ON "CallJob" ("createdAt")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_retryOfCallJobId_idx" ON "CallJob" ("retryOfCallJobId")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_parentCallJobId_idx" ON "CallJob" ("parentCallJobId")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_scheduledFor_idx" ON "CallJob" ("scheduledFor")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_retryStatus_idx" ON "CallJob" ("retryStatus")')
  await exec('CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_idx" ON "TaskActivity" ("taskId")')
  await exec('CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_entityId_idx" ON "AuditEvent" ("entityType", "entityId")')

  await prisma.$disconnect()
}

console.log(`Using ${isPostgres ? 'Postgres' : 'SQLite'} Prisma schema: ${path.relative(root, schema)}`)
console.log(`Database URL: ${process.env.DATABASE_URL}`)

if (action === 'check') {
  run(['prisma', 'validate', '--schema', schema])
} else if (action === 'migrate') {
  if (isPostgres) {
    run(['prisma', 'db', 'push', '--schema', schema])
  } else {
    run(['prisma', 'generate', '--schema', schema])
    await runSqliteRuntimeMigration()
    console.log('SQLite runtime migration completed without destructive schema changes.')
  }
} else if (action === 'seed') {
  run(['prisma', 'generate', '--schema', schema])
  const seed = path.join(root, 'server/prisma/seed.mjs')
  const node = process.execPath
  const result = spawnSync(node, [seed], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
} else {
  console.error(`Unknown db action "${action}". Use one of: check, migrate, seed.`)
  process.exit(1)
}

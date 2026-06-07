import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function resolveDatabaseUrl() {
  for (const key of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL']) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

let databaseUrl = resolveDatabaseUrl()
const isPostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl)
if (isPostgres && !process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = databaseUrl
}
const schema = path.join(root, isPostgres ? 'server/prisma/schema.postgres.prisma' : 'server/prisma/schema.prisma')
const action = process.argv[2] ?? 'check'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db'
}

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

  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "assignedTeam" TEXT NOT NULL DEFAULT \'Unassigned\'')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "dueDate" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "dueTime" TEXT NOT NULL DEFAULT \'15:00\'')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "sourceWorkflow" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "issueSummary" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "activityJson" TEXT')
  await addColumn('ALTER TABLE "StaffTask" ADD COLUMN "completedAt" DATETIME')

  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_status_idx" ON "StaffTask" ("status")')
  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_priority_idx" ON "StaffTask" ("priority")')
  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_dueDate_idx" ON "StaffTask" ("dueDate")')
  await exec('CREATE INDEX IF NOT EXISTS "StaffTask_callJobId_idx" ON "StaffTask" ("callJobId")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_callStatus_idx" ON "CallJob" ("callStatus")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_twilioCallSid_idx" ON "CallJob" ("twilioCallSid")')
  await exec('CREATE INDEX IF NOT EXISTS "CallJob_createdAt_idx" ON "CallJob" ("createdAt")')
  await exec('CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_idx" ON "TaskActivity" ("taskId")')
  await exec('CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_entityId_idx" ON "AuditEvent" ("entityType", "entityId")')

  await prisma.$disconnect()
}

console.log(`Using ${isPostgres ? 'Postgres' : 'SQLite'} Prisma schema: ${path.relative(root, schema)}`)

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

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

function resolveDatabaseUrl() {
  for (const key of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL']) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

const databaseUrl = resolveDatabaseUrl()
const isPostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl)
if (isPostgres && !process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = databaseUrl
}
const schema = isPostgres
  ? 'server/prisma/schema.postgres.prisma'
  : 'server/prisma/schema.prisma'

console.log(`Generating Prisma client with ${isPostgres ? 'Postgres' : 'SQLite'} schema: ${schema}`)

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['prisma', 'generate', '--schema', path.resolve(schema)], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)

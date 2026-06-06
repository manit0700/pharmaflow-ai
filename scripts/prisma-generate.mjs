import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const databaseUrl = process.env.DATABASE_URL ?? ''
const isPostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl)
const schema = isPostgres
  ? 'server/prisma/schema.postgres.prisma'
  : 'server/prisma/schema.prisma'

console.log(`Generating Prisma client with ${isPostgres ? 'Postgres' : 'SQLite'} schema: ${schema}`)

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['prisma', 'generate', '--schema', path.resolve(schema)], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)

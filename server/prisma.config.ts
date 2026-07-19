import path from 'path'
import { defineConfig } from 'prisma/config'
import { PrismaPg } from '@prisma/adapter-pg'
import fs from 'fs'

function databaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL
  const localConfigPath = path.join(import.meta.dirname, 'local.config.json')
  if (fs.existsSync(localConfigPath)) {
    const local = JSON.parse(fs.readFileSync(localConfigPath, 'utf8')) as { DATABASE_URL?: string }
    if (local.DATABASE_URL?.trim()) {
      process.env.DATABASE_URL = local.DATABASE_URL
      return local.DATABASE_URL
    }
  }
  return ''
}

const url = databaseUrl()

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma/schema.prisma'),
  datasource: {
    url,
  },
  migrate: {
    adapter: () => new PrismaPg({ connectionString: url }),
  },
})

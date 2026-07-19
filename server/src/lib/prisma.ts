import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { withAccelerate } from '@prisma/extension-accelerate'
import { loadSettings } from '../loadSettings.js'
import { resolveSqliteDatabaseUrl } from './databaseUrl.js'

// Ensure config/env is loaded before Prisma reads DATABASE_URL.
loadSettings()

if (!process.env.DATABASE_URL?.trim()) {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  process.env.DATABASE_URL = resolveSqliteDatabaseUrl(serverRoot)
}

function makePrisma(): PrismaClient {
  const url = process.env.DATABASE_URL ?? ''
  if (url.startsWith('prisma://')) {
    // Prisma Compute / Accelerate — HTTP-based engine, no binary needed
    return new PrismaClient().$extends(withAccelerate()) as unknown as PrismaClient
  }
  // Local / BYO postgres — use pg driver adapter
  const adapter = new PrismaPg({ connectionString: url })
  return new PrismaClient({ adapter })
}

export const prisma = makePrisma()

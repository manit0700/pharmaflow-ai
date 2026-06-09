import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { loadSettings } from '../loadSettings.js'
import { resolveSqliteDatabaseUrl } from './databaseUrl.js'

// Ensure config/env is loaded before Prisma reads DATABASE_URL.
loadSettings()

if (!process.env.DATABASE_URL?.trim()) {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  process.env.DATABASE_URL = resolveSqliteDatabaseUrl(serverRoot)
}

export const prisma = new PrismaClient()

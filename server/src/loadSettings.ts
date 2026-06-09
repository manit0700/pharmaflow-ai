import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { normalizeDatabaseEnv, resolveSqliteDatabaseUrl } from './lib/databaseUrl.js'

export type ConfigSource = 'local.config.json' | 'env'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localConfigPath = path.join(serverRoot, 'local.config.json')
const envPath = path.join(serverRoot, '.env')

let configSource: ConfigSource = 'env'
let loaded = false

function applyLocalConfig(json: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(json)) {
    if (value == null || value === '') continue
    process.env[key] = typeof value === 'string' ? value : String(value)
  }
}

/** Load PC config or dotenv — call once before reading config. */
export function loadSettings(): ConfigSource {
  if (loaded) return configSource
  loaded = true

  if (process.env.VERCEL !== '1' && fs.existsSync(localConfigPath)) {
    const raw = fs.readFileSync(localConfigPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    applyLocalConfig(parsed)
    configSource = 'local.config.json'
  } else {
    dotenv.config({ path: envPath })
    configSource = 'env'
  }

  normalizeDatabaseEnv()

  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = resolveSqliteDatabaseUrl(serverRoot)
  } else if (!process.env.VERCEL && process.env.DATABASE_URL.startsWith('file:')) {
    process.env.DATABASE_URL = resolveSqliteDatabaseUrl(serverRoot, process.env.DATABASE_URL)
  }

  return configSource
}

export function getConfigSource(): ConfigSource {
  return configSource
}

loadSettings()

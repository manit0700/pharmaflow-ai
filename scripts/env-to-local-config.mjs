#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, 'server', '.env')
const outPath = path.join(root, 'server', 'local.config.json')

if (!fs.existsSync(envPath)) {
  console.error('No server/.env found. Copy server/local.config.example.json to server/local.config.json instead.')
  process.exit(1)
}

const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
const config = {}

for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq <= 0) continue
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  config[key] = value
}

fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Wrote ${outPath} (${Object.keys(config).length} keys from server/.env)`)

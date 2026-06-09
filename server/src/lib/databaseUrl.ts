import path from 'path'

/** Resolve relative SQLite paths to an absolute file URL under serverRoot. */
export function resolveSqliteDatabaseUrl(serverRoot: string, rawUrl?: string): string {
  const url = (rawUrl ?? process.env.DATABASE_URL ?? 'file:./dev.db').trim()
  if (!url.startsWith('file:')) return url
  const filePath = url.slice('file:'.length)
  if (path.isAbsolute(filePath)) return url
  return `file:${path.resolve(serverRoot, filePath)}`
}

/** Resolve the active database URL from Vercel/Prisma Postgres or standard env. */
export function resolveDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ]
  for (const value of candidates) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

export function isPostgresDatabaseUrl(url: string): boolean {
  return /^postgres(?:ql)?:\/\//i.test(url)
}

/** Prefer Postgres URL from integration vars when DATABASE_URL is blank. */
export function normalizeDatabaseEnv(): void {
  const resolved = resolveDatabaseUrl()
  if (!resolved) return
  const current = process.env.DATABASE_URL?.trim() ?? ''
  if (!current || (isPostgresDatabaseUrl(resolved) && !isPostgresDatabaseUrl(current))) {
    process.env.DATABASE_URL = resolved
  }
}

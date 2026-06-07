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

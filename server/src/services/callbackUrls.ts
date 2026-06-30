import { createHash } from 'crypto'
import { config } from '../config.js'

export interface CallbackReadiness {
  publicBaseUrl: string
  isHttps: boolean
  isLocalTunnel: boolean
  ready: boolean
  warning: string | null
}

export function normalizeCallbackPath(path: string): string {
  const clean = path.trim()
  if (!clean.startsWith('/')) return `/${clean}`
  return clean
}

export function buildPublicCallbackUrl(path: string, params: Record<string, string | undefined> = {}): string {
  const base = config.publicBaseUrl.replace(/\/+$/, '')
  const url = new URL(normalizeCallbackPath(path), `${base}/`)
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, value)
  }
  return url.toString()
}

export function getCallbackReadiness(): CallbackReadiness {
  const base = config.publicBaseUrl
  const isHttps = base.startsWith('https://')
  const isLocalTunnel = /ngrok(-free)?\.(app|dev)|ngrok\.io|loca\.lt|trycloudflare\.com/i.test(base)
  let warning: string | null = null

  if (!base) warning = 'PUBLIC_BASE_URL is not set.'
  else if (/\s|->/.test(base)) warning = 'PUBLIC_BASE_URL must be one URL only.'
  else if (/localhost|127\.0\.0\.1/i.test(base)) warning = 'PUBLIC_BASE_URL cannot be localhost for Twilio callbacks.'
  else if (!isHttps) warning = 'PUBLIC_BASE_URL must use HTTPS.'
  else if (config.configSource === 'local.config.json' && /vercel\.app/i.test(base)) {
    warning = 'Local config points callbacks at Vercel instead of a local tunnel.'
  }

  return {
    publicBaseUrl: base,
    isHttps,
    isLocalTunnel,
    ready: warning === null,
    warning,
  }
}

export function maskSid(sid: string | null | undefined): string | null {
  if (!sid) return null
  if (sid.length <= 8) return `${sid.slice(0, 2)}***`
  return `${sid.slice(0, 4)}...${sid.slice(-4)}`
}

export function callbackEventKey(parts: Array<string | null | undefined>): string {
  return createHash('sha256')
    .update(parts.filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 20)
}

export function logCallbackDiagnostic(params: {
  route: string
  callJobId?: string | null
  twilioCallSid?: string | null
  twilioStatus?: string | null
  foundJob: boolean
  updated?: boolean
  error?: unknown
}) {
  const safeError =
    params.error instanceof Error
      ? params.error.message
      : params.error == null
        ? undefined
        : String(params.error)
  console.info('twilio_callback', {
    route: params.route,
    callJobId: params.callJobId ?? null,
    twilioCallSid: maskSid(params.twilioCallSid),
    twilioStatus: params.twilioStatus ?? null,
    foundJob: params.foundJob,
    updated: params.updated ?? false,
    error: safeError,
    at: new Date().toISOString(),
  })
}

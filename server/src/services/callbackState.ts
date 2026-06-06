import crypto from 'crypto'
import { config, type CallReason } from '../config.js'

export type CallbackState = {
  id: string
  patientName: string
  phoneNumber: string
  dob: string
  medicationName: string
  callReason: CallReason
}

function keyMaterial(): string {
  return [
    config.twilioApiKeySecret,
    config.twilioAuthToken,
    config.twilioAccountSid,
    config.twilioPhoneNumber,
  ].join('|')
}

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(keyMaterial()).digest()
}

function b64url(input: Buffer): string {
  return input.toString('base64url')
}

export function encodeCallbackState(state: CallbackState): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const payload = Buffer.from(JSON.stringify(state), 'utf8')
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
  const tag = cipher.getAuthTag()
  return [b64url(iv), b64url(tag), b64url(encrypted)].join('.')
}

export function decodeCallbackState(value: string | undefined): CallbackState | null {
  if (!value) return null
  try {
    const [ivRaw, tagRaw, encryptedRaw] = value.split('.')
    if (!ivRaw || !tagRaw || !encryptedRaw) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ])
    return JSON.parse(decrypted.toString('utf8')) as CallbackState
  } catch {
    return null
  }
}

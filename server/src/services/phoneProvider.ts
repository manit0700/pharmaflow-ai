import type { CallReason } from '../config.js'
import { config } from '../config.js'
import { fetchTwilioAccountSummary } from '../lib/twilioAuth.js'
import {
  getLiveCallReadiness,
  getTwilioAuthMode,
  isTwilioConfigured,
  startOutboundCall as startTwilioOutboundCall,
  type LiveCallReadiness,
} from './twilio.js'

export type PhoneProviderId = 'twilio'

export type StartOutboundCallInput = {
  to: string
  callJobId: string
  callReason: CallReason
  patientName: string
  dob: string
  medicationName: string
  prescriptionCost?: number | null
  prescriptionsJson?: string | null
}

export type StartOutboundCallResult = { sid: string; status: string } | { testMode: true; sid: string }

export type PhoneProviderReadiness = LiveCallReadiness & {
  provider: PhoneProviderId
  displayName: string
  carrierName: string
  fromNumber: string
  configured: boolean
  authMode: string
}

export type PhoneProviderAccountSummary = {
  type: string
  friendlyName: string
  status: string
} | null

export interface PhoneProvider {
  id: PhoneProviderId
  displayName: string
  carrierName: string
  isConfigured(): boolean
  getAuthMode(): string
  getFromNumber(): string
  getReadiness(): PhoneProviderReadiness
  getAccountSummary(): Promise<PhoneProviderAccountSummary>
  startOutboundCall(input: StartOutboundCallInput): Promise<StartOutboundCallResult>
}

class TwilioPhoneProvider implements PhoneProvider {
  id: PhoneProviderId = 'twilio'
  displayName = 'PharmaFlow Calling'
  carrierName = 'Twilio'

  isConfigured(): boolean {
    return isTwilioConfigured()
  }

  getAuthMode(): string {
    return getTwilioAuthMode()
  }

  getFromNumber(): string {
    return config.twilioPhoneNumber
  }

  getReadiness(): PhoneProviderReadiness {
    return {
      ...getLiveCallReadiness(),
      provider: this.id,
      displayName: this.displayName,
      carrierName: this.carrierName,
      fromNumber: this.getFromNumber(),
      configured: this.isConfigured(),
      authMode: this.getAuthMode(),
    }
  }

  async getAccountSummary(): Promise<PhoneProviderAccountSummary> {
    if (!this.isConfigured()) return null
    return fetchTwilioAccountSummary()
  }

  startOutboundCall(input: StartOutboundCallInput): Promise<StartOutboundCallResult> {
    return startTwilioOutboundCall(input)
  }
}

export const phoneProvider: PhoneProvider = new TwilioPhoneProvider()

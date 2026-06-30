import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { fetchConfig, saveConfig, fetchCallerIdStatus, type ConfigSettings, type CallerIdStatus } from '@/utils/api'

export function SettingsPage() {
  const [settings, setSettings] = useState<ConfigSettings | null>(null)
  const [form, setForm] = useState<Partial<ConfigSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [callerIdStatus, setCallerIdStatus] = useState<CallerIdStatus | null>(null)
  const [callerIdError, setCallerIdError] = useState<string | null>(null)
  const [checkingCallerId, setCheckingCallerId] = useState(false)

  async function checkCallerIdStatus(number?: string) {
    setCheckingCallerId(true)
    setCallerIdError(null)
    try {
      const status = await fetchCallerIdStatus(number)
      setCallerIdStatus(status)
    } catch (e) {
      setCallerIdStatus(null)
      setCallerIdError(e instanceof Error ? e.message : 'Could not check caller ID right now.')
    } finally {
      setCheckingCallerId(false)
    }
  }

  useEffect(() => {
    fetchConfig()
      .then((data) => {
        setSettings(data)
        setForm(data)
        void checkCallerIdStatus()
      })
      .catch(() => toast.error('Could not load settings — is the server running?'))
      .finally(() => setLoading(false))
  }, [])

  function field(key: keyof ConfigSettings) {
    return String(form[key] ?? '')
  }

  function set(key: keyof ConfigSettings, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '')
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    return raw.trim()
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    try {
      const patches: Partial<ConfigSettings> = {
        twilioPhoneNumber: formatPhone(form.twilioPhoneNumber ?? settings.twilioPhoneNumber),
        staffPhone: formatPhone(form.staffPhone ?? settings.staffPhone),
        pharmacyName: (form.pharmacyName ?? settings.pharmacyName).trim(),
        callMode: form.callMode ?? settings.callMode,
        twilioVoice: form.twilioVoice ?? settings.twilioVoice,
        twilioLanguage: form.twilioLanguage ?? settings.twilioLanguage,
      }
      const result = await saveConfig(patches)
      setSettings(result.config)
      setForm(result.config)
      toast.success('Settings saved — changes are live immediately')
      void checkCallerIdStatus(result.config.twilioPhoneNumber)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function isDirty(): boolean {
    if (!settings) return false
    const keys: (keyof ConfigSettings)[] = [
      'twilioPhoneNumber', 'staffPhone', 'pharmacyName', 'callMode', 'twilioVoice', 'twilioLanguage',
    ]
    return keys.some((k) => String(form[k] ?? settings[k]) !== String(settings[k]))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Changes take effect immediately — no server restart needed.
          {settings?.configSource === 'local.config.json' && (
            <span className="ml-1">Values are persisted to server/local.config.json.</span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phone numbers</CardTitle>
              <CardDescription>The number patients see on caller ID and the staff callback line</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="twilioPhoneNumber">Outbound caller ID (FROM number)</Label>
                <Input
                  id="twilioPhoneNumber"
                  placeholder="+16822415143"
                  value={field('twilioPhoneNumber')}
                  onChange={(e) => {
                    set('twilioPhoneNumber', e.target.value)
                    setCallerIdStatus(null)
                    setCallerIdError(null)
                  }}
                  onBlur={(e) => set('twilioPhoneNumber', formatPhone(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Must be allowed by the connected phone carrier. E.164 format, e.g. +16825551234.
                </p>
                {callerIdStatus && (
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={callerIdStatus.usable ? 'default' : 'secondary'}>
                        {callerIdStatus.usable ? 'Ready for calls' : 'Cannot be used yet'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{callerIdStatus.message}</p>
                    {!callerIdStatus.usable && callerIdStatus.type === 'not_found' && (
                      <p className="text-xs text-muted-foreground">
                        To use a different number: purchase it in your PharmaFlow Calling account, or add it as a verified caller ID there first.
                      </p>
                    )}
                  </div>
                )}
                {checkingCallerId && (
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Checking whether this number can be used for live calls…
                  </div>
                )}
                {callerIdError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    {callerIdError}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void checkCallerIdStatus(formatPhone(field('twilioPhoneNumber')))}
                  disabled={checkingCallerId}
                  className="mt-1"
                >
                  {checkingCallerId ? 'Checking…' : 'Check caller ID'}
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staffPhone">Staff callback number</Label>
                <Input
                  id="staffPhone"
                  placeholder="+16822415143"
                  value={field('staffPhone')}
                  onChange={(e) => set('staffPhone', e.target.value)}
                  onBlur={(e) => set('staffPhone', formatPhone(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Pharmacy staff line for escalations and follow-ups.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pharmacy info</CardTitle>
              <CardDescription>Displayed in call scripts and messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pharmacyName">Pharmacy name</Label>
                <Input
                  id="pharmacyName"
                  placeholder="Premium Family Pharmacy"
                  value={field('pharmacyName')}
                  onChange={(e) => set('pharmacyName', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call settings</CardTitle>
              <CardDescription>AI conversation mode and voice options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Call mode</Label>
                <Select value={field('callMode')} onValueChange={(v) => set('callMode', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai">AI (speech recognition + OpenAI)</SelectItem>
                    <SelectItem value="dtmf">DTMF (keypad prompts)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  AI mode requires OPENAI_API_KEY to be set. DTMF works with keypad responses only.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Voice</Label>
                <Select value={field('twilioVoice')} onValueChange={(v) => set('twilioVoice', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Polly.Joanna">Polly.Joanna (female, US)</SelectItem>
                    <SelectItem value="Polly.Matthew">Polly.Matthew (male, US)</SelectItem>
                    <SelectItem value="Polly.Amy">Polly.Amy (female, UK)</SelectItem>
                    <SelectItem value="Polly.Brian">Polly.Brian (male, UK)</SelectItem>
                    <SelectItem value="Polly.Salli">Polly.Salli (female, US)</SelectItem>
                    <SelectItem value="Polly.Joey">Polly.Joey (male, US)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={field('twilioLanguage')} onValueChange={(v) => set('twilioLanguage', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="es-US">Spanish (US)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={() => void handleSave()} disabled={saving || !isDirty()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {isDirty() && (
              <Button
                variant="outline"
                onClick={() => settings && setForm(settings)}
                disabled={saving}
              >
                Discard
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

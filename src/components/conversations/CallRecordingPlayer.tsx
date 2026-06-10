import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Mic, Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatDuration } from '@/lib/utils'
import type { CallRecording, TranscriptSegment } from '@/types'

interface CallRecordingPlayerProps {
  recording: CallRecording
  transcript: TranscriptSegment[]
  patientName: string
}

export function CallRecordingPlayer({
  recording,
  transcript,
  patientName,
}: CallRecordingPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [currentSec, setCurrentSec] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechRef = useRef<SpeechSynthesisUtterance[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const progress = recording.durationSec > 0 ? currentSec / recording.durationSec : 0

  const activeSegmentIndex = useMemo(() => {
    if (!transcript.length) return -1
    let idx = 0
    for (let i = 0; i < transcript.length; i++) {
      if (transcript[i]!.startSec <= currentSec) idx = i
    }
    return idx
  }, [currentSec, transcript])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const peaks = recording.waveformPeaks
    const barW = w / peaks.length
    peaks.forEach((peak, i) => {
      const x = i * barW
      const barH = peak * (h - 8)
      const played = i / peaks.length <= progress
      ctx.fillStyle = played ? '#0d9488' : '#94a3b8'
      ctx.globalAlpha = played ? 0.9 : 0.35
      ctx.fillRect(x + 1, (h - barH) / 2, Math.max(1, barW - 2), barH)
    })

    ctx.globalAlpha = 1
    ctx.fillStyle = '#0f766e'
    ctx.fillRect(progress * w - 1, 0, 2, h)
  }, [recording.waveformPeaks, progress])

  const stopPlayback = useCallback(() => {
    setPlaying(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    window.speechSynthesis.cancel()
    speechRef.current = []
  }, [])

  const speakTranscript = useCallback(() => {
    if (!transcript.length || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    transcript.forEach((seg) => {
      const u = new SpeechSynthesisUtterance(seg.text)
      u.rate = seg.speaker === 'ai' ? 1.02 : 0.98
      u.pitch = seg.speaker === 'ai' ? 1.05 : 0.92
      speechRef.current.push(u)
      window.speechSynthesis.speak(u)
    })
  }, [transcript])

  const startPlayback = useCallback(() => {
    stopPlayback()
    setPlaying(true)
    setCurrentSec(0)
    speakTranscript()
    intervalRef.current = setInterval(() => {
      setCurrentSec((t) => {
        const next = t + 0.25
        if (next >= recording.durationSec) {
          stopPlayback()
          return recording.durationSec
        }
        return next
      })
    }, 250)
  }, [recording.durationSec, speakTranscript, stopPlayback])

  const seek = (sec: number) => {
    const clamped = Math.max(0, Math.min(recording.durationSec, sec))
    setCurrentSec(clamped)
    if (playing) {
      stopPlayback()
      setCurrentSec(clamped)
      setPlaying(true)
      intervalRef.current = setInterval(() => {
        setCurrentSec((t) => {
          const next = t + 0.25
          if (next >= recording.durationSec) {
            stopPlayback()
            return recording.durationSec
          }
          return next
        })
      }, 250)
    }
  }

  useEffect(() => () => stopPlayback(), [stopPlayback])

  const handleDownload = () => {
    const manifest = {
      fileName: recording.fileName,
      patient: patientName,
      durationSec: recording.durationSec,
      recordedAt: recording.recordedAt,
      consentCaptured: recording.consentCaptured,
      transcript,
      note: 'Call metadata export. Use Play for transcript voice replay until Twilio recording URL is linked.',
    }
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = recording.fileName.replace('.wav', '-manifest.json')
    a.click()
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Call recording</span>
          <Badge variant="secondary" className="text-[10px]">
            {recording.channelLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {recording.consentCaptured && <Badge variant="success">Consent on file</Badge>}
          <span>Retain {recording.retentionDays}d</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground font-mono truncate">{recording.fileName}</p>

      <div
        className="relative h-16 w-full cursor-pointer rounded-md bg-card border border-border overflow-hidden"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          seek(ratio * recording.durationSec)
        }}
        role="slider"
        aria-label="Recording timeline"
        aria-valuemin={0}
        aria-valuemax={recording.durationSec}
        aria-valuenow={currentSec}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      <div className="flex items-center gap-2">
        {!playing ? (
          <Button size="sm" onClick={startPlayback} disabled={recording.durationSec <= 0}>
            <Play className="h-3.5 w-3.5" />
            Play recording
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={stopPlayback}>
            <Pause className="h-3.5 w-3.5" />
            Pause
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => { stopPlayback(); setCurrentSec(0) }}>
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {formatDuration(Math.floor(currentSec))} / {formatDuration(recording.durationSec)}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Playback reads the stored transcript aloud. Waveform reflects call duration until Twilio recording is attached.
      </p>

      {transcript.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-auto border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
            Synced transcript
          </p>
          {transcript.map((seg, i) => (
            <button
              key={`${seg.startSec}-${i}`}
              type="button"
              onClick={() => seek(seg.startSec)}
              className={cn(
                'block w-full text-left rounded px-2 py-1 text-xs transition-colors',
                i === activeSegmentIndex && playing
                  ? 'bg-primary/15 text-accent-fg'
                  : 'hover:bg-muted text-muted-foreground',
              )}
            >
              <span className="font-medium capitalize">{seg.speaker}</span>
              <span className="mx-1 text-[10px]">{formatDuration(seg.startSec)}</span>— {seg.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

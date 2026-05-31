'use client'

// =============================================
// AudioRecorder — minimal voice-note composer for the inbox.
//
// Lifecycle:
//   1. Mounted with `active = true` -> request mic via getUserMedia.
//   2. While recording: show MM:SS counter and Stop button.
//   3. On stop: render <audio controls> preview + Cancel / Send buttons.
//   4. On Send: bubble up a File (audio/webm or audio/mp4) via `onSend`.
//   5. On Cancel or unmount: stop tracks, revoke blob URL.
//
// Why no waveform / hold-to-record: scope decision per Onda 6 plan.
// Backend already accepts mediaType='audio' with webm/mp4 MIMEs.
// =============================================

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, Send, Loader2, AlertCircle } from 'lucide-react'

interface AudioRecorderProps {
  onSend: (file: File) => void | Promise<void>
  onCancel: () => void
  isUploading?: boolean
}

type Phase = 'requesting' | 'recording' | 'preview' | 'error'

function pickSupportedMime(): { mimeType: string; ext: string } {
  // Meta's Cloud API rejects audio/webm. Only ogg/opus, mp4, aac, mpeg,
  // and amr are accepted. Prefer formats both the browser and Meta accept.
  const candidates: Array<{ mimeType: string; ext: string }> = [
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/mp4', ext: 'mp4' },
    { mimeType: 'audio/aac', ext: 'aac' },
    { mimeType: 'audio/mpeg', ext: 'mp3' },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c
    }
  }
  return { mimeType: '', ext: '' }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function AudioRecorder({ onSend, onCancel, isUploading = false }: AudioRecorderProps) {
  const [phase, setPhase] = useState<Phase>('requesting')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<{ mimeType: string; ext: string }>({ mimeType: '', ext: 'webm' })
  const fileRef = useRef<File | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)

  // Cleanup helper — MUST be idempotent because it runs on unmount AND on
  // user actions (cancel, send).
  function cleanupStream() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* ignore */ }
    }
    recorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => { /* ignore */ })
    }
    audioCtxRef.current = null
    analyserRef.current = null
  }

  function startWaveform(stream: MediaStream) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    analyserRef.current = analyser

    const buffer = new Uint8Array(analyser.frequencyBinCount)

    const draw = () => {
      const canvas = canvasRef.current
      const analyserNode = analyserRef.current
      if (!canvas || !analyserNode) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }
      const cssWidth = canvas.clientWidth
      const cssHeight = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== cssWidth * dpr) canvas.width = cssWidth * dpr
      if (canvas.height !== cssHeight * dpr) canvas.height = cssHeight * dpr
      const c2d = canvas.getContext('2d')
      if (!c2d) return

      analyserNode.getByteFrequencyData(buffer)
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0)
      c2d.clearRect(0, 0, cssWidth, cssHeight)

      const bars = 48
      const gap = 2
      const barWidth = Math.max(1, (cssWidth - gap * (bars - 1)) / bars)
      const step = Math.floor(buffer.length / bars)
      c2d.fillStyle = '#f97316'
      for (let i = 0; i < bars; i++) {
        const v = buffer[i * step] / 255
        const h = Math.max(2, v * cssHeight)
        const x = i * (barWidth + gap)
        const y = (cssHeight - h) / 2
        c2d.fillRect(x, y, barWidth, h)
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
  }

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream

        const mime = pickSupportedMime()
        if (!mime.mimeType) {
          stream.getTracks().forEach(t => t.stop())
          streamRef.current = null
          setError('Browser nao grava em formato compativel com o WhatsApp. Use Chrome, Edge ou Safari.')
          setPhase('error')
          return
        }
        mimeRef.current = mime

        const recorder = new MediaRecorder(stream, { mimeType: mime.mimeType })
        recorderRef.current = recorder
        chunksRef.current = []

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
        }

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mime.mimeType })
          const ts = new Date().toISOString().replace(/[:.]/g, '-')
          const file = new File([blob], `voice-${ts}.${mime.ext}`, { type: blob.type })
          fileRef.current = file
          const url = URL.createObjectURL(blob)
          setPreviewUrl(url)
          setPhase('preview')
          // Stop mic tracks immediately once we have the blob — no need to
          // keep recording-while-previewing.
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
          }
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
        }

        recorder.start()
        startedAtRef.current = Date.now()
        setSeconds(0)
        setPhase('recording')
        startWaveform(stream)
        timerRef.current = setInterval(() => {
          setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
        }, 250)
      } catch (e: any) {
        const name = e?.name || ''
        let msg = 'Nao foi possivel acessar o microfone.'
        if (name === 'NotAllowedError') msg = 'Permissao do microfone negada.'
        else if (name === 'NotFoundError') msg = 'Nenhum microfone encontrado.'
        else if (e?.message) msg = e.message
        setError(msg)
        setPhase('error')
      }
    }

    start()

    return () => {
      cancelled = true
      cleanupStream()
      // Revoke preview URL on unmount to avoid memory leak.
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleStop() {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
  }

  function handleCancel() {
    cleanupStream()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    fileRef.current = null
    onCancel()
  }

  async function handleSend() {
    if (!fileRef.current) return
    const file = fileRef.current
    // Defensive cleanup — stream should already be stopped at this point.
    cleanupStream()
    await onSend(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    fileRef.current = null
  }

  if (phase === 'error') {
    return (
      <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <span className="text-sm text-red-700 flex-1">{error}</span>
        <button
          onClick={onCancel}
          className="text-sm text-red-700 hover:text-red-900 font-medium"
        >
          Fechar
        </button>
      </div>
    )
  }

  if (phase === 'requesting') {
    return (
      <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        <span className="text-sm text-gray-600">Solicitando acesso ao microfone...</span>
        <button
          onClick={handleCancel}
          className="ml-auto text-sm text-gray-500 hover:text-gray-700"
        >
          Cancelar
        </button>
      </div>
    )
  }

  if (phase === 'recording') {
    return (
      <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
        <span className="relative flex h-3 w-3 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
        <Mic className="w-5 h-5 text-red-600 flex-shrink-0" />
        <span className="text-sm font-mono text-red-700 flex-shrink-0 tabular-nums">
          {formatDuration(seconds)}
        </span>
        <canvas
          ref={canvasRef}
          className="flex-1 h-8 min-w-0"
          aria-hidden="true"
        />
        <button
          onClick={handleCancel}
          className="p-2 rounded-lg hover:bg-red-100 text-red-600 flex-shrink-0"
          title="Cancelar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleStop}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium flex-shrink-0"
        >
          <Square className="w-3.5 h-3.5" />
          Parar
        </button>
      </div>
    )
  }

  // preview
  return (
    <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
      {previewUrl && (
        <audio src={previewUrl} controls className="flex-1 max-w-full" />
      )}
      <button
        onClick={handleCancel}
        disabled={isUploading}
        className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 disabled:opacity-50"
        title="Descartar"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <button
        onClick={handleSend}
        disabled={isUploading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
      >
        {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Enviar
      </button>
    </div>
  )
}

export default AudioRecorder

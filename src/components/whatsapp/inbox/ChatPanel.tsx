'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Bot, MoreVertical, UserPlus, PanelRightClose, PanelRightOpen,
  Send, Smile, Paperclip, Image as ImageIcon, FileText, Film, X,
  Check, CheckCheck, Clock, AlertCircle, Loader2, RefreshCw,
  Mic, MicOff, Square, Play, Pause, Trash2, Volume2,
} from 'lucide-react'
import { AIToggleButton } from './AIToggleButton'
import type { InboxConversation, InboxMessage } from '@/types/inbox'

// =============================================
// TYPES & INTERFACES
// =============================================

interface ChatPanelProps {
  conversation: InboxConversation
  messages: InboxMessage[]
  isLoading: boolean
  isSending: boolean
  isUploading?: boolean
  onSendMessage: (content: string, type?: string) => Promise<void>
  onSendMedia: (file: File, mediaType: string, caption?: string) => Promise<void>
  onToggleBot: () => Promise<void>
  onBack: () => void
  onToggleContactPanel: () => void
  showContactPanel: boolean
  onRetryMessage?: (message: InboxMessage) => Promise<void>
}

// =============================================
// HELPERS
// =============================================

const formatPhone = (phone?: string) => {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  return phone
}

const formatMessageTime = (date?: string) => {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const getInitials = (name?: string) => {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// =============================================
// EMOJI DATA (simplified for performance)
// =============================================

const EMOJI_CATEGORIES = [
  { name: 'Recentes', emojis: ['👍', '❤️', '😂', '😢', '😮', '😡', '🙏', '👏'] },
  { name: 'Rostos', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'] },
  { name: 'Gestos', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'] },
  { name: 'Objetos', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '🟰', '♾️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'] },
]

// =============================================
// EMOJI PICKER COMPONENT
// =============================================

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredEmojis = searchQuery
    ? EMOJI_CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(searchQuery))
    : EMOJI_CATEGORIES[activeCategory].emojis

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl overflow-hidden z-50">
      {/* Search */}
      <div className="p-2 border-b border-dark-700">
        <input
          type="text"
          placeholder="Buscar emoji..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm text-white placeholder-dark-400 focus:outline-none"
        />
      </div>

      {/* Categories */}
      <div className="flex border-b border-dark-700 overflow-x-auto">
        {EMOJI_CATEGORIES.map((cat, idx) => (
          <button
            key={cat.name}
            onClick={() => { setActiveCategory(idx); setSearchQuery('') }}
            className={`px-3 py-2 text-xs whitespace-nowrap ${
              activeCategory === idx && !searchQuery ? 'text-primary-400 border-b-2 border-primary-400' : 'text-dark-400'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Emojis Grid */}
      <div className="h-48 overflow-y-auto p-2">
        <div className="grid grid-cols-8 gap-1">
          {filteredEmojis.map((emoji, idx) => (
            <button
              key={`${emoji}-${idx}`}
              onClick={() => onSelect(emoji)}
              className="w-8 h-8 flex items-center justify-center text-xl hover:bg-dark-700 rounded transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Close */}
      <div className="p-2 border-t border-dark-700 flex justify-end">
        <button onClick={onClose} className="text-xs text-dark-400 hover:text-white">
          Fechar
        </button>
      </div>
    </div>
  )
}

// =============================================
// AUDIO PLAYER COMPONENT
// =============================================

function AudioPlayer({ src, isOutbound }: { src: string; isOutbound: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => setDuration(audio.duration)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleEnded = () => { setIsPlaying(false); setCurrentTime(0) }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const time = parseFloat(e.target.value)
    audio.currentTime = time
    setCurrentTime(time)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg min-w-[200px] ${isOutbound ? 'bg-primary-600/30' : 'bg-dark-700/50'}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isOutbound ? 'bg-white/20 hover:bg-white/30' : 'bg-primary-500/20 hover:bg-primary-500/30'
        }`}
      >
        {isPlaying ? (
          <Pause className={`w-5 h-5 ${isOutbound ? 'text-white' : 'text-primary-400'}`} />
        ) : (
          <Play className={`w-5 h-5 ${isOutbound ? 'text-white' : 'text-primary-400'}`} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div className="relative h-1 bg-dark-600 rounded-full overflow-hidden mb-1">
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${isOutbound ? 'bg-white/70' : 'bg-primary-400'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time */}
        <div className={`flex justify-between text-[10px] ${isOutbound ? 'text-white/70' : 'text-dark-400'}`}>
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <Volume2 className={`w-4 h-4 flex-shrink-0 ${isOutbound ? 'text-white/50' : 'text-dark-500'}`} />
    </div>
  )
}

// =============================================
// AUDIO RECORDER COMPONENT
// =============================================

function AudioRecorder({
  onSend,
  onCancel,
  isSending
}: {
  onSend: (blob: Blob) => void
  onCancel: () => void
  isSending: boolean
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)

    } catch (err) {
      console.error('Error accessing microphone:', err)
      alert('Erro ao acessar microfone. Verifique as permissoes.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob)
    }
  }

  const handleCancel = () => {
    if (isRecording) {
      stopRecording()
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioBlob(null)
    setAudioUrl(null)
    setDuration(0)
    onCancel()
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [])

  return (
    <div className="flex items-center gap-3 p-3 bg-dark-800 rounded-xl border border-dark-700">
      {/* Cancel button */}
      <button
        onClick={handleCancel}
        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Recording indicator / Preview */}
      <div className="flex-1 flex items-center gap-3">
        {isRecording ? (
          <>
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-mono">{formatDuration(duration)}</span>
            <span className="text-dark-400 text-sm">Gravando...</span>
          </>
        ) : audioUrl ? (
          <audio src={audioUrl} controls className="flex-1 h-10" />
        ) : (
          <span className="text-dark-400 text-sm">Clique no microfone para gravar</span>
        )}
      </div>

      {/* Record / Stop / Send button */}
      {isRecording ? (
        <button
          onClick={stopRecording}
          className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600"
        >
          <Square className="w-5 h-5" />
        </button>
      ) : audioBlob ? (
        <button
          onClick={handleSend}
          disabled={isSending}
          className="p-3 rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      ) : (
        <button
          onClick={startRecording}
          className="p-3 rounded-full bg-primary-500 text-white hover:bg-primary-600"
        >
          <Mic className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}

// =============================================
// MESSAGE STATUS ICON
// =============================================

function MessageStatus({ status }: { status: InboxMessage['status'] }) {
  switch (status) {
    case 'pending': return <Clock className="w-4 h-4 text-dark-500" />
    case 'sent': return <Check className="w-4 h-4 text-dark-500" />
    case 'delivered': return <CheckCheck className="w-4 h-4 text-dark-500" />
    case 'read': return <CheckCheck className="w-4 h-4 text-cyan-400" />
    case 'played': return <CheckCheck className="w-4 h-4 text-cyan-400" />
    case 'failed': return <AlertCircle className="w-4 h-4 text-error-400" />
    default: return <Clock className="w-4 h-4 text-dark-500" />
  }
}

// =============================================
// MESSAGE BUBBLE
// =============================================

function MessageBubble({
  message,
  contactName,
  onRetry
}: {
  message: InboxMessage
  contactName?: string
  onRetry?: (msg: InboxMessage) => void
}) {
  const isOutbound = message.direction === 'outbound'
  const isBot = message.sent_by_bot
  const isFailed = message.status === 'failed'
  const isPending = message.status === 'pending'

  return (
    <div className={`flex gap-3 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      {!isOutbound && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-white text-xs font-semibold">{getInitials(contactName)}</span>
        </div>
      )}

      <div className={`max-w-[70%] ${isOutbound ? 'items-end' : 'items-start'}`}>
        <div className={`relative rounded-2xl px-4 py-2.5 ${
          isFailed
            ? 'bg-red-900/50 border border-red-500/50 rounded-tr-md'
            : isPending
              ? 'bg-dark-700 opacity-70 rounded-tr-md'
              : isOutbound
                ? isBot ? 'bg-gradient-to-r from-primary-500 to-primary-600 rounded-tr-md' : 'bg-primary-500 rounded-tr-md'
                : 'bg-dark-800 border border-dark-700/50 rounded-tl-md'
        }`}>
          {isBot && <div className="absolute top-2 right-2"><Bot className="w-3 h-3 text-white/50" /></div>}

          {/* Image */}
          {message.message_type === 'image' && message.media_url && (
            <img
              src={message.media_url}
              alt="Imagem"
              loading="lazy"
              className="rounded-lg mb-2 cursor-pointer hover:opacity-90 w-full max-w-[320px] max-h-[360px] object-contain bg-dark-900/30"
              onClick={() => window.open(message.media_url, '_blank')}
            />
          )}

          {/* Video */}
          {message.message_type === 'video' && message.media_url && (
            <video
              src={message.media_url}
              controls
              preload="metadata"
              playsInline
              className="rounded-lg mb-2 w-full max-w-[360px] max-h-[360px] object-contain bg-dark-900/30"
            />
          )}

          {/* Audio - Custom Player */}
          {(message.message_type === 'audio' || message.message_type === 'ptt') && message.media_url && (
            <AudioPlayer src={message.media_url} isOutbound={isOutbound} />
          )}

          {/* Document */}
          {message.message_type === 'document' && message.media_url && (
            <a
              href={message.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-dark-700/50 rounded-lg mb-2 hover:bg-dark-700"
            >
              <FileText className="w-5 h-5 text-primary-400" />
              <span className="text-sm text-white truncate">{message.media_filename || 'Documento'}</span>
            </a>
          )}

          {/* Sticker */}
          {message.message_type === 'sticker' && message.media_url && (
            <img
              src={message.media_url}
              alt="Sticker"
              className="w-32 h-32 object-contain"
            />
          )}

          {/* Text content */}
          {message.content && message.message_type !== 'audio' && message.message_type !== 'ptt' && (
            <p className={`text-sm whitespace-pre-wrap break-words ${isOutbound ? 'text-white' : 'text-dark-100'}`}>
              {message.content}
            </p>
          )}

          {/* Error state */}
          {isFailed && (
            <div className="mt-2 pt-2 border-t border-red-500/30">
              <p className="text-xs text-red-300 mb-1">
                {(message as any).error || message.error_message || 'Falha ao enviar'}
              </p>
              {onRetry && (
                <button
                  onClick={() => onRetry(message)}
                  className="text-xs text-red-300 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Tentar novamente
                </button>
              )}
            </div>
          )}
        </div>

        {/* Time and status */}
        <div className={`flex items-center gap-1.5 mt-1 px-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          {isPending && <span className="text-[10px] text-dark-400">Enviando...</span>}
          {isBot && isOutbound && !isPending && <span className="text-[10px] text-dark-500">via Bot</span>}
          <span className="text-[10px] text-dark-500">{formatMessageTime(message.created_at)}</span>
          {isOutbound && <MessageStatus status={message.status} />}
        </div>
      </div>
    </div>
  )
}

// =============================================
// DATE SEPARATOR
// =============================================

function DateSeparator({ date }: { date: string }) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Hoje'
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
  }

  return (
    <div className="flex items-center gap-4 my-4">
      <div className="flex-1 h-px bg-dark-700/50" />
      <span className="text-xs text-dark-500 bg-dark-900 px-3 py-1 rounded-full">{formatDate(date)}</span>
      <div className="flex-1 h-px bg-dark-700/50" />
    </div>
  )
}

// =============================================
// MEDIA PREVIEW MODAL
// =============================================

function MediaPreviewModal({
  file,
  onClose,
  onSend,
  isSending
}: {
  file: File
  onClose: () => void
  onSend: (caption: string) => void
  isSending: boolean
}) {
  const [caption, setCaption] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')

  useEffect(() => {
    if (file.size > 16 * 1024 * 1024) {
      setError('Arquivo muito grande. Maximo: 16MB')
      return
    }
    if (isImage || isVideo) {
      const url = URL.createObjectURL(file)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [file, isImage, isVideo])

  const getMediaType = () => {
    if (file.type.startsWith('image/')) return 'Imagem'
    if (file.type.startsWith('video/')) return 'Video'
    if (file.type.startsWith('audio/')) return 'Audio'
    return 'Documento'
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-2xl max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 className="text-white font-semibold">Enviar {getMediaType()}</h3>
          <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg">
            <X className="w-5 h-5 text-dark-400" />
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400">{error}</span>
            </div>
          ) : (
            <>
              {isImage && preview && (
                <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg object-contain" />
              )}
              {isVideo && preview && (
                <video src={preview} controls className="max-h-64 mx-auto rounded-lg" />
              )}
              {!isImage && !isVideo && (
                <div className="flex items-center gap-3 p-4 bg-dark-700/50 rounded-lg">
                  <FileText className="w-10 h-10 text-primary-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{file.name}</p>
                    <p className="text-sm text-dark-400">{formatFileSize(file.size)}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!error && (
          <div className="px-4 pb-4">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Adicionar legenda (opcional)"
              className="w-full px-4 py-3 bg-dark-700/50 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
            />
          </div>
        )}

        <div className="flex gap-3 p-4 border-t border-dark-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-dark-700 text-white rounded-xl hover:bg-dark-600"
          >
            Cancelar
          </button>
          <button
            onClick={() => !error && onSend(caption)}
            disabled={isSending || !!error}
            className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
            ) : (
              <><Send className="w-4 h-4" /> Enviar</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// MAIN CHAT PANEL COMPONENT
// =============================================

export function ChatPanel({
  conversation,
  messages,
  isLoading,
  isSending,
  isUploading = false,
  onSendMessage,
  onSendMedia,
  onToggleBot,
  onBack,
  onToggleContactPanel,
  showContactPanel,
  onRetryMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAudioRecorder, setShowAudioRecorder] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video' | 'document'>('document')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Send text message
  const handleSend = async () => {
    if (!input.trim() || isSending) return
    const content = input.trim()
    setInput('')
    setShowEmojiPicker(false)
    await onSendMessage(content)
  }

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Insert emoji
  const handleEmojiSelect = (emoji: string) => {
    setInput(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // File type selection
  const handleFileTypeSelect = (type: 'image' | 'video' | 'document') => {
    setSelectedMediaType(type)
    if (!fileInputRef.current) return
    fileInputRef.current.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '*/*'
    fileInputRef.current.click()
    setShowAttachMenu(false)
  }

  // File change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
    e.target.value = ''
  }

  // Send media
  const handleSendMedia = async (caption: string) => {
    if (!selectedFile) return
    await onSendMedia(selectedFile, selectedMediaType, caption)
    setSelectedFile(null)
  }

  // Send audio
  const handleSendAudio = async (blob: Blob) => {
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' })
    await onSendMedia(file, 'audio')
    setShowAudioRecorder(false)
  }

  const contactName = conversation.contact_name || formatPhone(conversation.phone_number)

  // Group messages by date
  const groupedMessages: { date: string; messages: InboxMessage[] }[] = []
  let currentDate = ''
  messages.forEach(msg => {
    const msgDate = new Date(msg.created_at).toDateString()
    if (msgDate !== currentDate) {
      currentDate = msgDate
      groupedMessages.push({ date: msg.created_at, messages: [msg] })
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg)
    }
  })

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      {/* Media Preview Modal */}
      {selectedFile && (
        <MediaPreviewModal
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onSend={handleSendMedia}
          isSending={isUploading}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700/50 bg-dark-800/30">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-2 rounded-lg hover:bg-dark-700/50 text-dark-400">
            <ArrowLeft className="w-5 h-5" />
          </button>

          {conversation.contact_avatar ? (
            <img src={conversation.contact_avatar} alt={contactName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">{getInitials(contactName)}</span>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-white">{contactName}</h3>
            <p className="text-xs text-dark-400">{formatPhone(conversation.phone_number)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AIToggleButton
            conversationId={conversation.id}
            initialEnabled={conversation.ai_enabled !== false}
            variant="default"
          />

          <button
            onClick={onToggleBot}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              conversation.is_bot_active
                ? 'bg-primary-500/10 text-primary-400 border border-primary-500/30'
                : 'bg-dark-700/50 text-dark-400 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">{conversation.is_bot_active ? 'Bot Ativo' : 'Bot Off'}</span>
          </button>

          <button className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white">
            <UserPlus className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white">
            <MoreVertical className="w-5 h-5" />
          </button>
          <button
            onClick={onToggleContactPanel}
            className="hidden lg:block p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white"
          >
            {showContactPanel ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-dark-400">
            <div className="w-16 h-16 rounded-2xl bg-dark-800/50 flex items-center justify-center mb-4">
              <Send className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm">Nenhuma mensagem ainda</p>
            <p className="text-xs text-dark-500 mt-1">Envie uma mensagem para iniciar</p>
          </div>
        ) : (
          <>
            {groupedMessages.map((group) => (
              <div key={group.date}>
                <DateSeparator date={group.date} />
                <div className="space-y-3">
                  {group.messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      contactName={contactName}
                      onRetry={onRetryMessage}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-dark-700/50 bg-dark-800/30">
        {/* 24h Window Warning */}
        {conversation.can_send_template_only && (
          <div className="flex items-center gap-2 p-3 mb-3 bg-warning-500/10 border border-warning-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-warning-400 flex-shrink-0" />
            <span className="text-sm text-warning-400">Janela de 24h expirada. Use um template.</span>
            <button className="ml-auto text-sm text-primary-400 font-medium hover:underline">
              Enviar Template
            </button>
          </div>
        )}

        {/* Audio Recorder */}
        {showAudioRecorder ? (
          <AudioRecorder
            onSend={handleSendAudio}
            onCancel={() => setShowAudioRecorder(false)}
            isSending={isUploading}
          />
        ) : (
          <div className="flex items-end gap-2">
            {/* Emoji Button */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-2.5 rounded-xl ${
                  showEmojiPicker
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'hover:bg-dark-700/50 text-dark-400 hover:text-primary-400'
                }`}
              >
                <Smile className="w-5 h-5" />
              </button>

              {showEmojiPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                </>
              )}
            </div>

            {/* Attach Menu */}
            <div className="relative">
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className={`p-2.5 rounded-xl ${
                  showAttachMenu
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'hover:bg-dark-700/50 text-dark-400 hover:text-primary-400'
                }`}
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-2 bg-dark-800 border border-dark-700 rounded-xl shadow-lg overflow-hidden z-50">
                    <button
                      onClick={() => handleFileTypeSelect('image')}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-dark-700 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-green-400" />
                      </div>
                      <span className="text-white">Imagem</span>
                    </button>
                    <button
                      onClick={() => handleFileTypeSelect('video')}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-dark-700 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Film className="w-4 h-4 text-purple-400" />
                      </div>
                      <span className="text-white">Video</span>
                    </button>
                    <button
                      onClick={() => handleFileTypeSelect('document')}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-dark-700 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="text-white">Documento</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Text Input */}
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite uma mensagem..."
                disabled={isSending}
                rows={1}
                className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 resize-none disabled:opacity-50"
                style={{ maxHeight: '120px' }}
              />
            </div>

            {/* Mic / Send Button */}
            {input.trim() ? (
              <button
                onClick={handleSend}
                disabled={isSending}
                className="p-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            ) : (
              <button
                onClick={() => setShowAudioRecorder(true)}
                className="p-3 rounded-xl bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-white"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-2 mt-2">
          <button className="px-3 py-1.5 text-xs bg-dark-700/50 text-dark-400 rounded-lg hover:text-white hover:bg-dark-700">
            /atalhos
          </button>
          <button className="px-3 py-1.5 text-xs bg-dark-700/50 text-dark-400 rounded-lg hover:text-white hover:bg-dark-700">
            📋 Templates
          </button>
        </div>
      </div>
    </div>
  )
}

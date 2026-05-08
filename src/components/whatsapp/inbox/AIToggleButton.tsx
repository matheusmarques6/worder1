'use client'

import { useState } from 'react'
import { Pause, Loader2, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface AIToggleButtonProps {
  conversationId: string
  initialEnabled?: boolean
  onStatusChange?: (enabled: boolean) => void
  variant?: 'default' | 'compact' | 'full'
  className?: string
}

/**
 * AIToggleButton — pausa/despausa a IA na conversa atual.
 *
 * Backend canônico: POST /api/whatsapp/conversations/[id]/ai
 *   - body { action: 'toggle' | 'enable' | 'disable', reason? }
 *   - response { ai_enabled, ai_paused, ... }
 *
 * Aesthetic: paleta Worder (laranja primary + zinc neutro), Lucide stroke
 * 1.75, sem gradients.
 */
export function AIToggleButton({
  conversationId,
  initialEnabled = true,
  onStatusChange,
  variant = 'default',
  className = '',
}: AIToggleButtonProps) {
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  const [isLoading, setIsLoading] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const toggleAI = async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/whatsapp/conversations/${conversationId}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', reason: 'manual_toggle' }),
      })
      const data = await response.json()
      if (data.success) {
        const enabled = !!data.ai_enabled
        setIsEnabled(enabled)
        onStatusChange?.(enabled)
      } else {
        console.error('Erro ao alterar IA:', data.error)
      }
    } catch (error) {
      console.error('Erro ao alterar IA:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (variant === 'compact') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={toggleAI}
          disabled={isLoading}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          aria-label={isEnabled ? 'Pausar IA' : 'Ativar IA'}
          className={`
            p-2 rounded-md transition-colors duration-200
            ${
              isEnabled
                ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
                : 'bg-zinc-100 text-zinc-500 border border-zinc-200 hover:bg-zinc-200'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
          ) : isEnabled ? (
            <Sparkles className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <Pause className="w-4 h-4" strokeWidth={1.75} />
          )}
        </button>

        <AnimatePresence>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1
                         bg-white border border-zinc-200 rounded-md text-xs text-zinc-700 whitespace-nowrap z-50 shadow-sm"
            >
              {isEnabled ? 'Pausar IA' : 'Ativar IA'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={toggleAI}
        disabled={isLoading}
        className={`
          flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors duration-200 w-full
          ${
            isEnabled
              ? 'bg-orange-50 border border-orange-200'
              : 'bg-zinc-50 border border-zinc-200'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
      >
        <div
          className={`p-2 rounded-md ${
            isEnabled ? 'bg-orange-100 text-orange-600' : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
          ) : isEnabled ? (
            <Sparkles className="w-5 h-5" strokeWidth={1.75} />
          ) : (
            <Pause className="w-5 h-5" strokeWidth={1.75} />
          )}
        </div>

        <div className="flex-1 text-left">
          <div
            className={`text-sm font-medium ${
              isEnabled ? 'text-orange-700' : 'text-zinc-700'
            }`}
          >
            Agente IA
          </div>
          <div className={`text-xs ${isEnabled ? 'text-orange-600/80' : 'text-zinc-500'}`}>
            {isEnabled ? 'Respondendo automaticamente' : 'Pausada'}
          </div>
        </div>

        <div
          className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ${
            isEnabled ? 'bg-orange-500' : 'bg-zinc-300'
          }`}
        >
          <motion.div
            animate={{ x: isEnabled ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="w-4 h-4 rounded-full bg-white shadow-sm"
          />
        </div>
      </button>
    )
  }

  // Default — botão médio com ícone + texto
  return (
    <button
      type="button"
      onClick={toggleAI}
      disabled={isLoading}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200
        ${
          isEnabled
            ? 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
            : 'bg-zinc-50 text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
      ) : isEnabled ? (
        <Sparkles className="w-4 h-4" strokeWidth={1.75} />
      ) : (
        <Pause className="w-4 h-4" strokeWidth={1.75} />
      )}
      <span className="hidden sm:inline">
        {isLoading ? 'Salvando...' : isEnabled ? 'IA Ativa' : 'IA Pausada'}
      </span>
    </button>
  )
}

/** Pílula de status para listagens. Worder palette (laranja/zinc). */
export function AIStatusBadge({
  enabled,
  size = 'sm',
}: {
  enabled: boolean
  size?: 'xs' | 'sm' | 'md'
}) {
  const sizeClasses = {
    xs: 'w-2 h-2',
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
  }
  return (
    <div className="relative" title={enabled ? 'IA ativa' : 'IA pausada'}>
      <div
        className={`${sizeClasses[size]} rounded-full ${
          enabled ? 'bg-orange-500' : 'bg-zinc-300'
        }`}
      />
    </div>
  )
}

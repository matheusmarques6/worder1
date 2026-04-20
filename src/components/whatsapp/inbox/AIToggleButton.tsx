'use client'

import { useState } from 'react'
import { Bot, Pause, Play, Loader2, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface AIToggleButtonProps {
  conversationId: string
  initialEnabled?: boolean
  onStatusChange?: (enabled: boolean) => void
  variant?: 'default' | 'compact' | 'full'
  className?: string
}

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
        body: JSON.stringify({ 
          action: 'toggle',
          reason: 'manual_toggle',
        }),
      })

      const data = await response.json()

      if (data.success) {
        setIsEnabled(data.ai_enabled)
        onStatusChange?.(data.ai_enabled)
      } else {
        console.error('Erro ao alterar IA:', data.error)
      }

    } catch (error) {
      console.error('Erro ao alterar IA:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Variante compacta (só ícone)
  if (variant === 'compact') {
    return (
      <div className="relative">
        <button
          onClick={toggleAI}
          disabled={isLoading}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`
            p-2 rounded-lg transition-all duration-200
            ${isEnabled 
              ? 'bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-400 border border-violet-500/30 hover:from-violet-500/30 hover:to-purple-500/30' 
              : 'bg-gray-100 text-gray-500 hover:text-gray-600 hover:bg-gray-100'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isEnabled ? (
            <Sparkles className="w-4 h-4" />
          ) : (
            <Pause className="w-4 h-4" />
          )}
        </button>

        {/* Tooltip */}
        <AnimatePresence>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 
                         bg-white border border-gray-200 rounded-lg text-xs text-gray-600 whitespace-nowrap z-50"
            >
              {isEnabled ? 'Pausar IA' : 'Ativar IA'}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 
                              border-4 border-transparent border-t-dark-800" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // Variante full (com texto e status)
  if (variant === 'full') {
    return (
      <button
        onClick={toggleAI}
        disabled={isLoading}
        className={`
          flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 w-full
          ${isEnabled 
            ? 'bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/30' 
            : 'bg-gray-100/30 border border-gray-200'
          }
          hover:scale-[1.02] active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
          ${className}
        `}
      >
        <div className={`
          p-2 rounded-lg
          ${isEnabled 
            ? 'bg-violet-500/20 text-violet-400' 
            : 'bg-gray-100 text-gray-500'
          }
        `}>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isEnabled ? (
            <Sparkles className="w-5 h-5" />
          ) : (
            <Pause className="w-5 h-5" />
          )}
        </div>
        
        <div className="flex-1 text-left">
          <div className={`text-sm font-medium ${isEnabled ? 'text-violet-300' : 'text-gray-600'}`}>
            Agente IA
          </div>
          <div className={`text-xs ${isEnabled ? 'text-violet-400/70' : 'text-gray-400'}`}>
            {isEnabled ? 'Respondendo automaticamente' : 'Pausado'}
          </div>
        </div>

        <div className={`
          w-10 h-5 rounded-full p-0.5 transition-colors duration-200
          ${isEnabled ? 'bg-violet-500' : 'bg-gray-200'}
        `}>
          <motion.div
            animate={{ x: isEnabled ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="w-4 h-4 rounded-full bg-white shadow-sm"
          />
        </div>
      </button>
    )
  }

  // Variante default (botão médio com ícone e texto)
  return (
    <button
      onClick={toggleAI}
      disabled={isLoading}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
        ${isEnabled 
          ? 'bg-gradient-to-r from-violet-500/10 to-purple-500/10 text-violet-400 border border-violet-500/30 hover:from-violet-500/20 hover:to-purple-500/20' 
          : 'bg-gray-100 text-gray-500 hover:text-white hover:bg-gray-100'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isEnabled ? (
        <Sparkles className="w-4 h-4" />
      ) : (
        <Pause className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">
        {isLoading ? 'Salvando...' : isEnabled ? 'IA Ativa' : 'IA Pausada'}
      </span>
    </button>
  )
}

// Versão simplificada para listas
export function AIStatusBadge({ 
  enabled, 
  size = 'sm' 
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
      <div className={`
        ${sizeClasses[size]} rounded-full
        ${enabled ? 'bg-violet-500' : 'bg-gray-300'}
      `} />
      {enabled && (
        <div className={`
          absolute inset-0 ${sizeClasses[size]} rounded-full bg-violet-500 
          animate-ping opacity-75
        `} />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  ChevronDown,
  Check,
  Loader2,
  Plus,
  Settings,
  Wifi,
  WifiOff,
  MessageSquare,
  Users,
} from 'lucide-react'
import Link from 'next/link'

interface WhatsAppNumber {
  id: string
  phone_number: string
  display_name?: string
  provider: 'meta_cloud' | 'evolution'
  is_connected: boolean
  is_active: boolean
  stats?: {
    total_conversations: number
    messages_today: number
  }
}

interface NumberSelectorProps {
  selectedNumberId: string | null
  onNumberChange: (numberId: string | null) => void
  showAllOption?: boolean
  className?: string
}

export default function NumberSelector({
  selectedNumberId,
  onNumberChange,
  showAllOption = true,
  className = '',
}: NumberSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([])
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch numbers
  useEffect(() => {
    const fetchNumbers = async () => {
      try {
        const res = await fetch('/api/whatsapp/numbers?include_stats=true')
        const data = await res.json()
        setNumbers(data.numbers || [])
      } catch (error) {
        console.error('Error fetching numbers:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchNumbers()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get selected number
  const selectedNumber = selectedNumberId 
    ? numbers.find(n => n.id === selectedNumberId)
    : null

  // Connected numbers count
  const connectedCount = numbers.filter(n => n.is_connected).length

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl hover:border-dark-600 transition-colors w-full"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 text-dark-400 animate-spin" />
        ) : (
          <>
            <div className="relative">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedNumber?.is_connected 
                  ? 'bg-green-500/20' 
                  : selectedNumber 
                  ? 'bg-red-500/20'
                  : 'bg-dark-700/50'
              }`}>
                <Phone className={`w-4 h-4 ${
                  selectedNumber?.is_connected 
                    ? 'text-green-400' 
                    : selectedNumber 
                    ? 'text-red-400'
                    : 'text-dark-400'
                }`} />
              </div>
              {selectedNumber && (
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-800 ${
                  selectedNumber.is_connected ? 'bg-green-400' : 'bg-red-400'
                }`} />
              )}
            </div>
            
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {selectedNumber?.display_name || selectedNumber?.phone_number || 'Todos os números'}
              </p>
              <p className="text-xs text-dark-400">
                {selectedNumber 
                  ? (selectedNumber.provider === 'meta_cloud' ? 'API Oficial' : 'Evolution')
                  : `${connectedCount} conectado${connectedCount !== 1 ? 's' : ''}`}
              </p>
            </div>

            <ChevronDown className={`w-5 h-5 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-dark-700/50">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Números de WhatsApp</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-dark-300">
                  {numbers.length} número{numbers.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Options */}
            <div className="max-h-64 overflow-y-auto">
              {/* All Numbers Option */}
              {showAllOption && (
                <button
                  onClick={() => {
                    onNumberChange(null)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50 transition-colors ${
                    !selectedNumberId ? 'bg-primary-500/10' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-dark-700/50 flex items-center justify-center">
                    <Users className="w-4 h-4 text-dark-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-white">Todos os números</p>
                    <p className="text-xs text-dark-400">Ver todas as conversas</p>
                  </div>
                  {!selectedNumberId && (
                    <Check className="w-5 h-5 text-primary-400" />
                  )}
                </button>
              )}

              {/* Number List */}
              {numbers.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Phone className="w-8 h-8 text-dark-500 mx-auto mb-2" />
                  <p className="text-sm text-dark-400">Nenhum número conectado</p>
                  <Link
                    href="/whatsapp/settings"
                    className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 mt-2"
                  >
                    <Plus className="w-3 h-3" />
                    Conectar número
                  </Link>
                </div>
              ) : (
                numbers.map((number) => (
                  <button
                    key={number.id}
                    onClick={() => {
                      onNumberChange(number.id)
                      setIsOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50 transition-colors ${
                      selectedNumberId === number.id ? 'bg-primary-500/10' : ''
                    }`}
                  >
                    <div className="relative">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        number.is_connected ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        <Phone className={`w-4 h-4 ${
                          number.is_connected ? 'text-green-400' : 'text-red-400'
                        }`} />
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-800 ${
                        number.is_connected ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                    </div>
                    
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {number.display_name || number.phone_number}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-dark-400">
                        <span>{number.phone_number}</span>
                        <span className="text-dark-600">•</span>
                        <span className={`flex items-center gap-1 ${
                          number.is_connected ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {number.is_connected ? (
                            <><Wifi className="w-3 h-3" /> Online</>
                          ) : (
                            <><WifiOff className="w-3 h-3" /> Offline</>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    {number.stats && (
                      <div className="text-right">
                        <p className="text-xs text-dark-300">{number.stats.messages_today} hoje</p>
                        <p className="text-xs text-dark-500">{number.stats.total_conversations} total</p>
                      </div>
                    )}

                    {selectedNumberId === number.id && (
                      <Check className="w-5 h-5 text-primary-400 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-dark-700/50 bg-dark-900/50">
              <Link
                href="/whatsapp/settings"
                className="flex items-center justify-center gap-2 text-sm text-dark-400 hover:text-white transition-colors"
              >
                <Settings className="w-4 h-4" />
                Gerenciar números
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Compact version for header
export function NumberSelectorCompact({
  selectedNumberId,
  onNumberChange,
}: NumberSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchNumbers = async () => {
      try {
        const res = await fetch('/api/whatsapp/numbers?connected_only=true')
        const data = await res.json()
        setNumbers(data.numbers || [])
      } catch (error) {
        console.error('Error fetching numbers:', error)
      }
    }

    fetchNumbers()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedNumber = selectedNumberId 
    ? numbers.find(n => n.id === selectedNumberId)
    : null

  if (numbers.length <= 1) return null

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-dark-800/50 border border-dark-700/50 rounded-lg hover:border-dark-600 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full ${
          selectedNumber?.is_connected ? 'bg-green-400' : 'bg-yellow-400'
        }`} />
        <span className="text-sm text-white">
          {selectedNumber?.display_name || selectedNumber?.phone_number || 'Todos'}
        </span>
        <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 z-50 mt-2 w-56 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl overflow-hidden"
          >
            <button
              onClick={() => {
                onNumberChange(null)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 hover:bg-dark-700/50 transition-colors ${
                !selectedNumberId ? 'bg-primary-500/10' : ''
              }`}
            >
              <Users className="w-4 h-4 text-dark-400" />
              <span className="text-sm text-white">Todos</span>
              {!selectedNumberId && <Check className="w-4 h-4 text-primary-400 ml-auto" />}
            </button>

            {numbers.map((number) => (
              <button
                key={number.id}
                onClick={() => {
                  onNumberChange(number.id)
                  setIsOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 hover:bg-dark-700/50 transition-colors ${
                  selectedNumberId === number.id ? 'bg-primary-500/10' : ''
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  number.is_connected ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <span className="text-sm text-white truncate">
                  {number.display_name || number.phone_number}
                </span>
                {selectedNumberId === number.id && (
                  <Check className="w-4 h-4 text-primary-400 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

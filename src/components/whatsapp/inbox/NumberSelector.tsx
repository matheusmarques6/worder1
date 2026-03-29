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
  organizationId: string    // ✅ FASE 1: Obrigatório
  storeId: string           // ✅ FASE 1: Obrigatório
  selectedNumberId: string | null
  onNumberChange: (numberId: string | null) => void
  showAllOption?: boolean
  className?: string
}

export default function NumberSelector({
  organizationId,
  storeId,
  selectedNumberId,
  onNumberChange,
  showAllOption = true,
  className = '',
}: NumberSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([])
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ✅ FASE 1: Fetch com storeId obrigatório e refetch ao trocar loja
  useEffect(() => {
    // Reset ao trocar de loja
    setNumbers([])
    setLoading(true)
    
    // ✅ FASE 1: Resetar seleção ao trocar de loja
    onNumberChange(null)

    const fetchNumbers = async () => {
      // Validar parâmetros obrigatórios
      if (!organizationId || !storeId) {
        console.log('[NumberSelector] Missing required params:', { organizationId, storeId })
        setLoading(false)
        return
      }

      try {
        console.log('[NumberSelector] Fetching for store:', storeId)
        
        const res = await fetch(
          `/api/whatsapp/numbers?organization_id=${organizationId}&store_id=${storeId}&include_stats=true`
        )
        
        if (!res.ok) {
          const error = await res.json()
          console.error('[NumberSelector] API Error:', error)
          setNumbers([])
          return
        }
        
        const data = await res.json()
        setNumbers(data.numbers || [])
        
        console.log('[NumberSelector] Found', data.numbers?.length || 0, 'numbers')
      } catch (error) {
        console.error('[NumberSelector] Fetch error:', error)
        setNumbers([])
      } finally {
        setLoading(false)
      }
    }

    fetchNumbers()
  }, [organizationId, storeId]) // ✅ FASE 1: Refetch quando storeId mudar

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
        className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors w-full"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        ) : (
          <>
            <div className="relative">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedNumber?.is_connected 
                  ? 'bg-green-500/20' 
                  : selectedNumber 
                  ? 'bg-red-500/20'
                  : 'bg-gray-100'
              }`}>
                <Phone className={`w-4 h-4 ${
                  selectedNumber?.is_connected 
                    ? 'text-green-400' 
                    : selectedNumber 
                    ? 'text-red-400'
                    : 'text-gray-500'
                }`} />
              </div>
              {selectedNumber && (
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-200 ${
                  selectedNumber.is_connected ? 'bg-green-400' : 'bg-red-400'
                }`} />
              )}
            </div>
            
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {selectedNumber?.display_name || selectedNumber?.phone_number || 'Todos os números'}
              </p>
              <p className="text-xs text-gray-500">
                {selectedNumber 
                  ? (selectedNumber.provider === 'meta_cloud' ? 'API Oficial' : 'Evolution')
                  : `${connectedCount} conectado${connectedCount !== 1 ? 's' : ''}`}
              </p>
            </div>

            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
            className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">Números de WhatsApp</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
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
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors ${
                    !selectedNumberId ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">Todos os números</p>
                    <p className="text-xs text-gray-500">Ver todas as conversas</p>
                  </div>
                  {!selectedNumberId && (
                    <Check className="w-5 h-5 text-brand-600" />
                  )}
                </button>
              )}

              {/* Number List */}
              {numbers.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Phone className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhum número conectado</p>
                  <Link
                    href="/whatsapp/settings"
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-500 mt-2"
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
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors ${
                      selectedNumberId === number.id ? 'bg-brand-50' : ''
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
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-200 ${
                        number.is_connected ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                    </div>
                    
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {number.display_name || number.phone_number}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{number.phone_number}</span>
                        <span className="text-gray-400">•</span>
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
                        <p className="text-xs text-gray-600">{number.stats.messages_today} hoje</p>
                        <p className="text-xs text-gray-400">{number.stats.total_conversations} total</p>
                      </div>
                    )}

                    {selectedNumberId === number.id && (
                      <Check className="w-5 h-5 text-brand-600 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
              <Link
                href="/whatsapp/settings"
                className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
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

// Compact version for header - também com storeId
interface NumberSelectorCompactProps {
  organizationId: string
  storeId: string
  selectedNumberId: string | null
  onNumberChange: (numberId: string | null) => void
}

export function NumberSelectorCompact({
  organizationId,
  storeId,
  selectedNumberId,
  onNumberChange,
}: NumberSelectorCompactProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ✅ FASE 1: Refetch ao trocar de loja
  useEffect(() => {
    setNumbers([])
    
    const fetchNumbers = async () => {
      if (!organizationId || !storeId) return
      
      try {
        const res = await fetch(
          `/api/whatsapp/numbers?organization_id=${organizationId}&store_id=${storeId}&connected_only=true`
        )
        if (res.ok) {
          const data = await res.json()
          setNumbers(data.numbers || [])
        }
      } catch (error) {
        console.error('[NumberSelectorCompact] Error:', error)
      }
    }

    fetchNumbers()
  }, [organizationId, storeId])

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
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full ${
          selectedNumber?.is_connected ? 'bg-green-400' : 'bg-yellow-400'
        }`} />
        <span className="text-sm text-gray-700">
          {selectedNumber?.display_name || selectedNumber?.phone_number || 'Todos'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 z-50 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          >
            <button
              onClick={() => {
                onNumberChange(null)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-100 transition-colors ${
                !selectedNumberId ? 'bg-brand-50' : ''
              }`}
            >
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">Todos</span>
              {!selectedNumberId && <Check className="w-4 h-4 text-brand-600 ml-auto" />}
            </button>

            {numbers.map((number) => (
              <button
                key={number.id}
                onClick={() => {
                  onNumberChange(number.id)
                  setIsOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-100 transition-colors ${
                  selectedNumberId === number.id ? 'bg-brand-50' : ''
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  number.is_connected ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <span className="text-sm text-gray-700 truncate">
                  {number.display_name || number.phone_number}
                </span>
                {selectedNumberId === number.id && (
                  <Check className="w-4 h-4 text-brand-600 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

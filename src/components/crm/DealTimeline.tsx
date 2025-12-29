'use client'

// =============================================
// Deal Timeline Component
// src/components/crm/DealTimeline.tsx
//
// Mostra histórico de mudanças de estágio do deal
// =============================================

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Clock,
  ArrowRight,
  User,
  RefreshCw,
} from 'lucide-react'

interface StageHistoryItem {
  id: string
  fromStage: { id: string; name: string } | null
  toStage: { id: string; name: string }
  changedBy: { full_name: string; avatar_url: string | null } | null
  changedAt: string
  timeInPreviousStage: string | null
  notes: string | null
}

interface DealTimelineProps {
  dealId: string
  className?: string
}

function formatTimeInterval(interval: string | null): string {
  if (!interval) return '-'
  
  // Formato: "HH:MM:SS" ou "X days HH:MM:SS"
  const daysMatch = interval.match(/(\d+)\s*days?/)
  const timeMatch = interval.match(/(\d+):(\d+):(\d+)/)
  
  if (daysMatch) {
    const days = parseInt(daysMatch[1])
    if (days > 0) return `${days}d`
  }
  
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    
    if (hours >= 24) {
      return `${Math.floor(hours / 24)}d ${hours % 24}h`
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }
  
  return interval
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Agora'
  if (diffMins < 60) return `${diffMins}min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: diffDays > 365 ? 'numeric' : undefined,
  })
}

export function DealTimeline({ dealId, className = '' }: DealTimelineProps) {
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<StageHistoryItem[]>([])
  const [metrics, setMetrics] = useState<{
    totalChanges: number
    totalTimeInPipelineHours: number
    averageTimePerStageHours: number
  } | null>(null)
  
  useEffect(() => {
    fetchHistory()
  }, [dealId])
  
  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/deals/${dealId}/history`)
      const data = await res.json()
      setHistory(data.history || [])
      setMetrics(data.metrics || null)
    } catch (error) {
      console.error('Error fetching deal history:', error)
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <RefreshCw className="w-5 h-5 animate-spin text-primary-500" />
      </div>
    )
  }
  
  if (history.length === 0) {
    return (
      <div className={`text-center py-8 text-dark-400 ${className}`}>
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhuma mudança de estágio registrada</p>
      </div>
    )
  }
  
  return (
    <div className={className}>
      {/* Metrics Summary */}
      {metrics && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-dark-800/50 rounded-lg text-center">
            <p className="text-lg font-semibold text-white">{metrics.totalChanges}</p>
            <p className="text-xs text-dark-400">Mudanças</p>
          </div>
          <div className="p-3 bg-dark-800/50 rounded-lg text-center">
            <p className="text-lg font-semibold text-white">
              {metrics.totalTimeInPipelineHours < 24 
                ? `${Math.round(metrics.totalTimeInPipelineHours)}h`
                : `${Math.round(metrics.totalTimeInPipelineHours / 24)}d`}
            </p>
            <p className="text-xs text-dark-400">Tempo Total</p>
          </div>
          <div className="p-3 bg-dark-800/50 rounded-lg text-center">
            <p className="text-lg font-semibold text-white">
              {metrics.averageTimePerStageHours < 24 
                ? `${Math.round(metrics.averageTimePerStageHours)}h`
                : `${Math.round(metrics.averageTimePerStageHours / 24)}d`}
            </p>
            <p className="text-xs text-dark-400">Média/Estágio</p>
          </div>
        </div>
      )}
      
      {/* Timeline */}
      <div className="relative">
        {/* Linha vertical */}
        <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-dark-700" />
        
        {/* Items */}
        <div className="space-y-4">
          {history.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative pl-6"
            >
              {/* Dot */}
              <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full bg-dark-900 border-2 border-primary-500" />
              
              {/* Content */}
              <div className="p-3 bg-dark-800/50 rounded-lg">
                {/* Stage Change */}
                <div className="flex items-center gap-2 mb-2">
                  {item.fromStage ? (
                    <>
                      <span className="text-sm text-dark-300">{item.fromStage.name}</span>
                      <ArrowRight className="w-4 h-4 text-dark-500" />
                      <span className="text-sm font-medium text-primary-400">{item.toStage.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-dark-400">Criado em</span>
                      <span className="text-sm font-medium text-primary-400">{item.toStage.name}</span>
                    </>
                  )}
                </div>
                
                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-dark-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(item.changedAt)}
                  </span>
                  
                  {item.timeInPreviousStage && (
                    <span className="px-2 py-0.5 bg-dark-700 rounded text-dark-300">
                      {formatTimeInterval(item.timeInPreviousStage)} no estágio anterior
                    </span>
                  )}
                  
                  {item.changedBy && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {item.changedBy.full_name}
                    </span>
                  )}
                </div>
                
                {/* Notes */}
                {item.notes && (
                  <p className="mt-2 text-sm text-dark-300 italic">
                    "{item.notes}"
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

'use client'

import { AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ServiceWindowBarProps {
  expiresAt?: string | null
}

export function ServiceWindowBar({ expiresAt }: ServiceWindowBarProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!expiresAt) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200 text-xs text-gray-600">
        <Clock className="w-3.5 h-3.5" />
        <span>Sem conversa ativa. Somente templates podem ser enviados.</span>
      </div>
    )
  }

  const now = Date.now()
  const expires = new Date(expiresAt).getTime()
  const diff = expires - now

  if (diff <= 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="font-medium">Janela expirada</span>
        <span className="text-red-600">- Somente templates aprovados podem ser enviados.</span>
      </div>
    )
  }

  const hoursLeft = Math.floor(diff / 3_600_000)
  const minutesLeft = Math.floor((diff % 3_600_000) / 60_000)
  const isLow = diff < 2 * 3_600_000

  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs ${
      isLow ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-green-50 border-green-200 text-green-700'
    }`}>
      <CheckCircle className="w-3.5 h-3.5" />
      <span className="font-medium">Janela de servico ativa</span>
      <span>
        - expira em {hoursLeft > 0 && `${hoursLeft}h `}
        {minutesLeft}min
      </span>
    </div>
  )
}

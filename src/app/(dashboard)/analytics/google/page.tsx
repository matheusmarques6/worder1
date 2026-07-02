'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'

export default function GoogleAdsAnalyticsPage() {
  const toast = useToast()
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const res = await fetch('/api/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.authUrl) {
        window.location.href = data.authUrl
      } else {
        toast.error('Não foi possível conectar', data.error || 'Tente novamente em instantes.')
        setConnecting(false)
      }
    } catch (error) {
      console.error('Error connecting Google Ads:', error)
      toast.error('Não foi possível conectar', 'Verifique sua conexão e tente novamente.')
      setConnecting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Google Ads</h1>
        <p className="text-gray-500 mt-1">Acompanhe o desempenho das suas campanhas no Google Ads</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-gray-900">Conecte sua conta</h3>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          Integre sua conta do Google Ads para visualizar métricas de campanhas, grupos de anúncios e anúncios em tempo real.
        </p>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="mt-6 px-6 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {connecting ? 'Conectando...' : 'Conectar Google Ads'}
        </button>
      </div>
    </div>
  )
}

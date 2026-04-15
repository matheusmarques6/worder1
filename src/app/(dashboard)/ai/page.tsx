'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Robot, ArrowRight, ShoppingCartSimple, ChatCircleDots, Lightning, CurrencyDollar } from '@phosphor-icons/react'

interface RecoverySummary {
  totals?: { abandoned?: number; recovered?: number; recovery_rate?: number; revenue?: number }
}

export default function AIPage() {
  const [summary, setSummary] = useState<RecoverySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/recovery?type=cart')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSummary(d) })
      .catch(() => { if (!cancelled) setSummary(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const revenue = summary?.totals?.revenue || 0
  const rate = summary?.totals?.recovery_rate || 0
  const recovered = summary?.totals?.recovered || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
            <Robot size={20} className="text-violet-500" weight="duotone" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Worder AI</h1>
            <p className="text-sm text-gray-500 mt-1">Recuperação automática de vendas com IA</p>
          </div>
        </div>
      </div>

      {/* Real KPIs from recovery module */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CurrencyDollar size={16} className="text-emerald-500" />
            <span className="text-xs text-gray-500">Receita Recuperada</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? '—' : `R$ ${revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          </p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCartSimple size={16} className="text-brand-500" />
            <span className="text-xs text-gray-500">Carrinhos Recuperados</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? '—' : recovered.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Lightning size={16} className="text-yellow-500" />
            <span className="text-xs text-gray-500">Taxa de Recuperação</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? '—' : `${(rate * 100).toFixed(1)}%`}
          </p>
        </div>
      </div>

      {/* Redirects to the real features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/recovery"
          className="group bg-white/50 border border-gray-200 rounded-xl p-6 hover:border-brand-500/40 hover:bg-white transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCartSimple size={22} className="text-brand-500" weight="duotone" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Recuperação de Vendas</h3>
                <p className="text-xs text-gray-500 mt-1">Carrinho, PIX, boleto e cartão</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
          </div>
        </Link>

        <Link
          href="/automations"
          className="group bg-white/50 border border-gray-200 rounded-xl p-6 hover:border-brand-500/40 hover:bg-white transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ChatCircleDots size={22} className="text-violet-500" weight="duotone" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Automações</h3>
                <p className="text-xs text-gray-500 mt-1">Crie flows com IA no WhatsApp</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
          </div>
        </Link>
      </div>

      <div className="bg-violet-500/5 border border-violet-200 rounded-xl p-5 text-sm text-gray-600">
        <p className="font-medium text-gray-900 mb-1">Como a IA trabalha para você</p>
        A Worder AI monitora carrinhos abandonados, pedidos com pagamento pendente e clientes
        inativos — escolhendo o melhor canal (WhatsApp, e-mail, SMS) e o melhor horário para
        disparar uma mensagem que recupera a venda. Tudo já acontece por trás dos fluxos
        configurados em <Link href="/automations" className="text-brand-500 underline">Automações</Link>.
      </div>
    </div>
  )
}

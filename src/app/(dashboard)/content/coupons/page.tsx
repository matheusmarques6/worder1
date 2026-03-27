'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Tag,
  Plus,
  MagnifyingGlass,
  Copy,
  PencilSimple,
  Trash,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  CurrencyDollar,
  Percent,
  ShoppingCart,
  UsersThree,
  CalendarBlank,
} from '@phosphor-icons/react'

const coupons = [
  { id: '1', code: 'BEMVINDO10', type: 'percentage', value: 10, minOrder: 50, maxDiscount: null, uses: 1240, maxUses: null, revenue: 8200, status: 'active', expires: null },
  { id: '2', code: 'FLASH50', type: 'fixed', value: 50, minOrder: 200, maxDiscount: null, uses: 340, maxUses: 500, revenue: 17000, status: 'active', expires: '15 Mar 2026' },
  { id: '3', code: 'FRETEGRATIS', type: 'shipping', value: 0, minOrder: 100, maxDiscount: null, uses: 890, maxUses: null, revenue: 12400, status: 'active', expires: null },
  { id: '4', code: 'ANIVERSARIO25', type: 'percentage', value: 25, minOrder: 0, maxDiscount: 100, uses: 156, maxUses: null, revenue: 3900, status: 'active', expires: '31 Mar 2026' },
  { id: '5', code: 'VIP30', type: 'percentage', value: 30, minOrder: 150, maxDiscount: 200, uses: 45, maxUses: 100, revenue: 6750, status: 'active', expires: null },
  { id: '6', code: 'BLACKFRIDAY70', type: 'percentage', value: 70, minOrder: 0, maxDiscount: 500, uses: 2800, maxUses: 3000, revenue: 98000, status: 'expired', expires: '30 Nov 2025' },
  { id: '7', code: 'PRIMAVERA20', type: 'percentage', value: 20, minOrder: 80, maxDiscount: null, uses: 0, maxUses: 200, revenue: 0, status: 'scheduled', expires: '30 Mar 2026' },
  { id: '8', code: 'RESGATA15', type: 'percentage', value: 15, minOrder: 0, maxDiscount: null, uses: 320, maxUses: null, revenue: 4800, status: 'paused', expires: null },
]

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400', icon: CheckCircle },
  expired: { label: 'Expirado', color: 'bg-red-500/10 text-red-400', icon: XCircle },
  scheduled: { label: 'Agendado', color: 'bg-yellow-500/10 text-yellow-400', icon: Clock },
  paused: { label: 'Pausado', color: 'bg-zinc-500/10 text-zinc-400', icon: Pause },
}

const kpis = [
  { title: 'Cupons Ativos', value: coupons.filter(c => c.status === 'active').length.toString(), icon: Tag, color: 'text-[#F26B2A]' },
  { title: 'Total de Usos', value: coupons.reduce((a, c) => a + c.uses, 0).toLocaleString('pt-BR'), icon: UsersThree, color: 'text-blue-400' },
  { title: 'Receita c/ Cupom', value: `R$ ${(coupons.reduce((a, c) => a + c.revenue, 0) / 1000).toFixed(0)}k`, icon: CurrencyDollar, color: 'text-emerald-400' },
  { title: 'Ticket Médio c/ Cupom', value: 'R$ 142', icon: ShoppingCart, color: 'text-purple-400' },
]

export default function CouponsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [copied, setCopied] = useState<string | null>(null)

  const filtered = coupons.filter((c) => {
    const matchSearch = !search || c.code.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/content" className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center">
            <Tag size={22} className="text-[#F26B2A]" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Cupons de Desconto</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Gerencie cupons promocionais para suas campanhas</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
          <Plus size={16} />
          Novo Cupom
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={kpi.color} />
                <span className="text-xs text-zinc-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
          />
        </div>
        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'active', label: 'Ativos' },
            { id: 'scheduled', label: 'Agendados' },
            { id: 'paused', label: 'Pausados' },
            { id: 'expired', label: 'Expirados' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                statusFilter === s.id ? 'bg-[#F26B2A] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Coupons Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs text-zinc-500 font-medium p-4 pb-3">Código</th>
              <th className="text-left text-xs text-zinc-500 font-medium p-4 pb-3">Desconto</th>
              <th className="text-left text-xs text-zinc-500 font-medium p-4 pb-3">Status</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Usos</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Receita</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Validade</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((coupon) => {
              const status = statusConfig[coupon.status]
              const StatusIcon = status.icon
              return (
                <tr key={coupon.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-white font-mono font-bold bg-zinc-800 px-2 py-0.5 rounded">{coupon.code}</code>
                      <button onClick={() => handleCopy(coupon.code)}>
                        {copied === coupon.code ? (
                          <CheckCircle size={14} className="text-emerald-400" />
                        ) : (
                          <Copy size={14} className="text-zinc-500 hover:text-zinc-300" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-white font-medium">
                      {coupon.type === 'percentage' ? `${coupon.value}% OFF` :
                       coupon.type === 'fixed' ? `R$ ${coupon.value} OFF` :
                       'Frete Grátis'}
                    </span>
                    {coupon.minOrder > 0 && (
                      <p className="text-[10px] text-zinc-600">Min. R$ {coupon.minOrder}</p>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon size={12} weight="fill" />
                      {status.label}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-zinc-400 text-right">
                    {coupon.uses.toLocaleString('pt-BR')}
                    {coupon.maxUses && <span className="text-zinc-600">/{coupon.maxUses}</span>}
                  </td>
                  <td className="p-4 text-sm text-emerald-400 font-medium text-right">
                    R$ {coupon.revenue.toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4 text-sm text-zinc-500 text-right">
                    {coupon.expires || 'Sem prazo'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button className="p-1.5 rounded hover:bg-zinc-800 transition-colors"><PencilSimple size={14} className="text-zinc-500" /></button>
                      <button className="p-1.5 rounded hover:bg-zinc-800 transition-colors"><Trash size={14} className="text-zinc-500" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

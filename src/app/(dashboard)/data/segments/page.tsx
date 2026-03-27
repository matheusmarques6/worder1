'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  UsersThree,
  FunnelSimple,
  Plus,
  MagnifyingGlass,
  Lightning,
  ArrowClockwise,
  TrendUp,
  Star,
  ShoppingCart,
  EnvelopeSimple,
  Clock,
  DotsThree,
  Eye,
  PencilSimple,
  Copy,
  Trash,
  CaretDown,
} from '@phosphor-icons/react'

type Segment = {
  id: string
  name: string
  description: string
  type: 'dynamic' | 'static'
  contacts: number
  growth: string
  positive: boolean
  lastUpdated: string
  conditions: string[]
}

const segments: Segment[] = [
  {
    id: '1',
    name: 'Compradores Recorrentes',
    description: 'Clientes com 2+ compras nos últimos 90 dias',
    type: 'dynamic',
    contacts: 3420,
    growth: '+12%',
    positive: true,
    lastUpdated: '5 min atrás',
    conditions: ['purchases > 2', 'last_purchase < 90d'],
  },
  {
    id: '2',
    name: 'Alto Valor (VIP)',
    description: 'LTV acima de R$ 500 e score > 70',
    type: 'dynamic',
    contacts: 1840,
    growth: '+8%',
    positive: true,
    lastUpdated: '5 min atrás',
    conditions: ['ltv > 500', 'score > 70'],
  },
  {
    id: '3',
    name: 'Risco de Churn',
    description: 'Inativos há 30+ dias com histórico de compra',
    type: 'dynamic',
    contacts: 2100,
    growth: '-5%',
    positive: false,
    lastUpdated: '5 min atrás',
    conditions: ['last_activity > 30d', 'total_purchases > 0'],
  },
  {
    id: '4',
    name: 'Carrinho Abandonado Recente',
    description: 'Abandonaram carrinho nas últimas 24h',
    type: 'dynamic',
    contacts: 156,
    growth: '+3%',
    positive: true,
    lastUpdated: '1 min atrás',
    conditions: ['cart_abandoned = true', 'cart_abandoned_at < 24h'],
  },
  {
    id: '5',
    name: 'Novos Leads (7d)',
    description: 'Contatos criados nos últimos 7 dias',
    type: 'dynamic',
    contacts: 820,
    growth: '+24%',
    positive: true,
    lastUpdated: '5 min atrás',
    conditions: ['created_at < 7d'],
  },
  {
    id: '6',
    name: 'Engajados E-mail',
    description: 'Abriram e-mail nos últimos 14 dias',
    type: 'dynamic',
    contacts: 8900,
    growth: '+6%',
    positive: true,
    lastUpdated: '5 min atrás',
    conditions: ['email_opened_at < 14d'],
  },
  {
    id: '7',
    name: 'Promoção Black Friday',
    description: 'Segmento manual para campanha BF 2025',
    type: 'static',
    contacts: 12400,
    growth: '0%',
    positive: true,
    lastUpdated: '28 Nov 2025',
    conditions: ['manual_list'],
  },
  {
    id: '8',
    name: 'CLV Predito > R$ 300',
    description: 'Contatos com CLV previsto pela IA acima de R$ 300',
    type: 'dynamic',
    contacts: 5200,
    growth: '+15%',
    positive: true,
    lastUpdated: '5 min atrás',
    conditions: ['predicted_clv > 300'],
  },
]

const conditionOptions = [
  { label: 'Compras', options: ['Total de compras', 'Valor total gasto', 'Última compra', 'Ticket médio'] },
  { label: 'Engajamento', options: ['Abriu e-mail', 'Clicou em link', 'Respondeu WhatsApp', 'Visitou site'] },
  { label: 'Perfil', options: ['Score', 'CLV Predito', 'Cidade', 'Tag', 'Canal preferido'] },
  { label: 'Tempo', options: ['Data de criação', 'Último acesso', 'Dias inativo'] },
]

export default function SegmentsPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'dynamic' | 'static'>('all')
  const [showBuilder, setShowBuilder] = useState(false)

  const filtered = segments.filter((s) => {
    if (filter !== 'all' && s.type !== filter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Segmentação</h1>
          <p className="text-sm text-zinc-400 mt-1">Crie e gerencie segmentos dinâmicos e estáticos</p>
        </div>
        <button
          onClick={() => setShowBuilder(!showBuilder)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
        >
          <Plus size={16} />
          Novo Segmento
        </button>
      </div>

      {/* Segment Builder (collapsed by default) */}
      {showBuilder && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-zinc-900/50 border border-[#F26B2A]/30 rounded-xl p-6"
        >
          <h3 className="text-sm font-semibold text-white mb-4">Criar Segmento</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Nome do Segmento</label>
              <input
                type="text"
                placeholder="Ex: Compradores frequentes"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-2">Condições</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-3">
                  <select className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white focus:outline-none">
                    {conditionOptions.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((opt) => (
                          <option key={opt}>{opt}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white focus:outline-none">
                    <option>é maior que</option>
                    <option>é menor que</option>
                    <option>é igual a</option>
                    <option>contém</option>
                    <option>nos últimos</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Valor"
                    className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 focus:outline-none"
                  />
                </div>
              </div>
              <button className="mt-2 text-xs text-[#F26B2A] hover:text-[#F5A623] transition-colors flex items-center gap-1">
                <Plus size={12} />
                Adicionar condição
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button className="px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 text-sm font-medium">
                Criar Segmento
              </button>
              <button
                onClick={() => setShowBuilder(false)}
                className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 text-sm"
              >
                Cancelar
              </button>
              <span className="text-xs text-zinc-500 ml-auto">
                Estimativa: ~2.400 contatos
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar segmentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
          />
        </div>
        <div className="flex bg-zinc-800/50 rounded-lg p-1">
          {[
            { id: 'all' as const, label: 'Todos' },
            { id: 'dynamic' as const, label: 'Dinâmicos' },
            { id: 'static' as const, label: 'Estáticos' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === f.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Segments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((seg, i) => (
          <motion.div
            key={seg.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  seg.type === 'dynamic' ? 'bg-[#F26B2A]/10' : 'bg-zinc-700'
                }`}>
                  {seg.type === 'dynamic' ? (
                    <Lightning size={16} className="text-[#F26B2A]" />
                  ) : (
                    <UsersThree size={16} className="text-zinc-400" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white">{seg.name}</h4>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    seg.type === 'dynamic' ? 'bg-[#F26B2A]/10 text-[#F5A623]' : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {seg.type === 'dynamic' ? 'Dinâmico' : 'Estático'}
                  </span>
                </div>
              </div>
              <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 transition-all">
                <DotsThree size={18} className="text-zinc-400" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 mb-3">{seg.description}</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-lg font-bold text-white">{seg.contacts.toLocaleString('pt-BR')}</span>
                  <span className="text-xs text-zinc-500 ml-1">contatos</span>
                </div>
                <span className={`text-xs ${seg.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {seg.growth}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-zinc-600">
                <ArrowClockwise size={12} />
                {seg.lastUpdated}
              </div>
            </div>

            {seg.conditions.length > 0 && seg.conditions[0] !== 'manual_list' && (
              <div className="mt-3 flex flex-wrap gap-1">
                {seg.conditions.map((cond) => (
                  <span key={cond} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400 font-mono">
                    {cond}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

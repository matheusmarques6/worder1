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
          <h1 className="text-2xl font-bold font-display text-gray-900">Segmentação</h1>
          <p className="text-sm text-gray-500 mt-1">Crie e gerencie segmentos dinâmicos e estáticos</p>
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
          className="bg-white/50 border border-[#F26B2A]/30 rounded-xl p-6"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Criar Segmento</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Nome do Segmento</label>
              <input
                type="text"
                placeholder="Ex: Compradores frequentes"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-2">Condições</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-gray-50/50 rounded-lg p-3">
                  <select className="bg-gray-100 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none">
                    {conditionOptions.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((opt) => (
                          <option key={opt}>{opt}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select className="bg-gray-100 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none">
                    <option>é maior que</option>
                    <option>é menor que</option>
                    <option>é igual a</option>
                    <option>contém</option>
                    <option>nos últimos</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Valor"
                    className="flex-1 bg-gray-100 border border-gray-200 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 focus:outline-none"
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
                className="px-4 py-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 text-sm"
              >
                Cancelar
              </button>
              <span className="text-xs text-gray-500 ml-auto">
                Estimativa: ~2.400 contatos
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar segmentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex bg-gray-50/50 rounded-lg p-1">
          {[
            { id: 'all' as const, label: 'Todos' },
            { id: 'dynamic' as const, label: 'Dinâmicos' },
            { id: 'static' as const, label: 'Estáticos' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === f.id ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-white'
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
            className="bg-white/50 border border-gray-200 rounded-xl p-5 hover:border-gray-200 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  seg.type === 'dynamic' ? 'bg-[#F26B2A]/10' : 'bg-gray-100'
                }`}>
                  {seg.type === 'dynamic' ? (
                    <Lightning size={16} className="text-[#F26B2A]" />
                  ) : (
                    <UsersThree size={16} className="text-gray-500" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900">{seg.name}</h4>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    seg.type === 'dynamic' ? 'bg-[#F26B2A]/10 text-[#F5A623]' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {seg.type === 'dynamic' ? 'Dinâmico' : 'Estático'}
                  </span>
                </div>
              </div>
              <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 transition-all">
                <DotsThree size={18} className="text-gray-500" />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-3">{seg.description}</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-lg font-bold text-gray-900">{seg.contacts.toLocaleString('pt-BR')}</span>
                  <span className="text-xs text-gray-500 ml-1">contatos</span>
                </div>
                <span className={`text-xs ${seg.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {seg.growth}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <ArrowClockwise size={12} />
                {seg.lastUpdated}
              </div>
            </div>

            {seg.conditions.length > 0 && seg.conditions[0] !== 'manual_list' && (
              <div className="mt-3 flex flex-wrap gap-1">
                {seg.conditions.map((cond) => (
                  <span key={cond} className="px-2 py-0.5 bg-gray-50 rounded text-xs text-gray-500 font-mono">
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

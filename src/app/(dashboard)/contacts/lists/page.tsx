'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ListBullets,
  Plus,
  MagnifyingGlass,
  UsersThree,
  PencilSimple,
  Trash,
  ArrowLeft,
  Clock,
  CheckCircle,
  Copy,
  EnvelopeSimple,
  WhatsappLogo,
  DeviceMobileSpeaker,
  Export,
  Lightning,
  FunnelSimple,
} from '@phosphor-icons/react'

const lists = [
  { id: '1', name: 'Newsletter Geral', contacts: 12450, description: 'Todos inscritos na newsletter', type: 'static', channels: ['email'], created: '15 Jan 2026', lastUsed: '12 Mar', growth: '+120/sem' },
  { id: '2', name: 'Compradores Recorrentes', contacts: 3420, description: 'Clientes com 3+ compras', type: 'dynamic', channels: ['email', 'whatsapp'], created: '01 Feb 2026', lastUsed: '11 Mar', growth: '+45/sem' },
  { id: '3', name: 'Leads Instagram', contacts: 890, description: 'Captados via Instagram Ads', type: 'static', channels: ['email', 'whatsapp', 'sms'], created: '05 Mar 2026', lastUsed: '10 Mar', growth: '+32/sem' },
  { id: '4', name: 'VIP - Alto Valor', contacts: 245, description: 'Ticket médio acima de R$ 500', type: 'dynamic', channels: ['whatsapp', 'email'], created: '10 Feb 2026', lastUsed: '12 Mar', growth: '+8/sem' },
  { id: '5', name: 'Carrinho Abandonado', contacts: 680, description: 'Abandonaram nos últimos 7 dias', type: 'dynamic', channels: ['whatsapp', 'email', 'sms'], created: '20 Jan 2026', lastUsed: '12 Mar', growth: '+95/sem' },
  { id: '6', name: 'Risco de Churn', contacts: 1540, description: 'Sem compras há 60+ dias', type: 'dynamic', channels: ['email'], created: '01 Mar 2026', lastUsed: '08 Mar', growth: '+25/sem' },
  { id: '7', name: 'Aniversariantes do Mês', contacts: 312, description: 'Contatos com aniversário este mês', type: 'dynamic', channels: ['whatsapp', 'sms'], created: '15 Feb 2026', lastUsed: '01 Mar', growth: '—' },
  { id: '8', name: 'Importação Mar/2026', contacts: 2680, description: 'Importação manual de CSV', type: 'static', channels: ['email'], created: '10 Mar 2026', lastUsed: 'Nunca', growth: '—' },
]

const channelIcons: Record<string, { icon: React.ComponentType<any>; color: string }> = {
  email: { icon: EnvelopeSimple, color: 'text-blue-400' },
  whatsapp: { icon: WhatsappLogo, color: 'text-green-400' },
  sms: { icon: DeviceMobileSpeaker, color: 'text-purple-400' },
}

export default function ContactListsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'static' | 'dynamic'>('all')

  const filtered = lists.filter((l) => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || l.type === typeFilter
    return matchSearch && matchType
  })

  const totalContacts = lists.reduce((a, l) => a + l.contacts, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/contacts" className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ListBullets size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Listas de Contatos</h1>
            <p className="text-sm text-zinc-400 mt-0.5">{lists.length} listas · {totalContacts.toLocaleString('pt-BR')} contatos</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
          <Plus size={16} />
          Nova Lista
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Total de Contatos</p>
          <p className="text-xl font-bold text-white">{totalContacts.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Listas Dinâmicas</p>
          <p className="text-xl font-bold text-white">{lists.filter(l => l.type === 'dynamic').length}</p>
          <p className="text-xs text-emerald-400">Atualizam automaticamente</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Listas Estáticas</p>
          <p className="text-xl font-bold text-white">{lists.filter(l => l.type === 'static').length}</p>
          <p className="text-xs text-zinc-500">Manuais / importação</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar listas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
          />
        </div>
        <div className="flex gap-1">
          {[
            { id: 'all' as const, label: 'Todas' },
            { id: 'dynamic' as const, label: 'Dinâmicas' },
            { id: 'static' as const, label: 'Estáticas' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                typeFilter === t.id ? 'bg-[#F26B2A] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lists */}
      <div className="space-y-3">
        {filtered.map((list, i) => (
          <motion.div
            key={list.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  list.type === 'dynamic' ? 'bg-[#F26B2A]/10' : 'bg-zinc-800'
                }`}>
                  {list.type === 'dynamic' ? (
                    <Lightning size={18} className="text-[#F26B2A]" weight="fill" />
                  ) : (
                    <ListBullets size={18} className="text-zinc-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white">{list.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      list.type === 'dynamic' ? 'bg-[#F26B2A]/10 text-[#F5A623]' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {list.type === 'dynamic' ? 'Dinâmica' : 'Estática'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{list.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5">
                  {list.channels.map((ch) => {
                    const channel = channelIcons[ch]
                    if (!channel) return null
                    const Icon = channel.icon
                    return <Icon key={ch} size={14} className={channel.color} weight="fill" />
                  })}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{list.contacts.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-zinc-600">{list.growth}</p>
                </div>
                <div className="text-right hidden md:block">
                  <p className="text-xs text-zinc-500">Último uso</p>
                  <p className="text-xs text-zinc-400">{list.lastUsed}</p>
                </div>
                <div className="flex gap-1">
                  <button className="p-1.5 rounded hover:bg-zinc-800 transition-colors"><Export size={14} className="text-zinc-500" /></button>
                  <button className="p-1.5 rounded hover:bg-zinc-800 transition-colors"><PencilSimple size={14} className="text-zinc-500" /></button>
                  <button className="p-1.5 rounded hover:bg-zinc-800 transition-colors"><Trash size={14} className="text-zinc-500" /></button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

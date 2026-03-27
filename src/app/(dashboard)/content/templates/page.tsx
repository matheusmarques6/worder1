'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  EnvelopeSimple,
  Plus,
  MagnifyingGlass,
  Copy,
  PencilSimple,
  Trash,
  Eye,
  Star,
  Clock,
  ArrowLeft,
  FunnelSimple,
  CheckCircle,
} from '@phosphor-icons/react'

const categories = ['Todos', 'Promoção', 'Recovery', 'Transacional', 'Onboarding', 'Pós-Venda', 'Newsletter']

const templates = [
  { id: '1', name: 'Boas-vindas Premium', category: 'Onboarding', subject: 'Bem-vindo à {loja}! 🎉', sends: 12400, openRate: 42.1, clickRate: 8.4, starred: true, updated: '2d atrás' },
  { id: '2', name: 'Carrinho Abandonado', category: 'Recovery', subject: '{nome}, você esqueceu algo! 🛒', sends: 8900, openRate: 38.2, clickRate: 12.6, starred: true, updated: '5d atrás' },
  { id: '3', name: 'Promoção Sazonal', category: 'Promoção', subject: '🔥 Só hoje: {desconto}% OFF em tudo!', sends: 4500, openRate: 28.4, clickRate: 6.8, starred: false, updated: '1sem atrás' },
  { id: '4', name: 'Confirmação de Pedido', category: 'Transacional', subject: 'Pedido #{pedido} confirmado ✅', sends: 21000, openRate: 72.3, clickRate: 15.2, starred: false, updated: '3d atrás' },
  { id: '5', name: 'PIX Pendente', category: 'Recovery', subject: '{nome}, seu PIX expira em 30 min ⏰', sends: 6700, openRate: 45.6, clickRate: 22.4, starred: true, updated: '1d atrás' },
  { id: '6', name: 'Review Pós-Compra', category: 'Pós-Venda', subject: '{nome}, conte como foi sua experiência', sends: 3200, openRate: 24.8, clickRate: 5.2, starred: false, updated: '2sem atrás' },
  { id: '7', name: 'Newsletter Mensal', category: 'Newsletter', subject: '📰 Novidades de {mes} na {loja}', sends: 15600, openRate: 22.1, clickRate: 4.8, starred: false, updated: '4d atrás' },
  { id: '8', name: 'Win-back 60 dias', category: 'Recovery', subject: 'Sentimos sua falta, {nome}! 💜', sends: 2100, openRate: 18.4, clickRate: 7.2, starred: false, updated: '1sem atrás' },
  { id: '9', name: 'Black Friday', category: 'Promoção', subject: '⚫ BLACK FRIDAY: até 70% OFF', sends: 28000, openRate: 35.6, clickRate: 14.8, starred: true, updated: '3m atrás' },
]

export default function EmailTemplatesPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const filtered = templates.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase())
    const matchCategory = category === 'Todos' || t.category === category
    return matchSearch && matchCategory
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/content" className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <EnvelopeSimple size={22} className="text-blue-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Templates de E-mail</h1>
            <p className="text-sm text-zinc-400 mt-0.5">{templates.length} templates disponíveis</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
          <Plus size={16} />
          Novo Template
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                category === cat ? 'bg-[#F26B2A] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((tmpl, i) => (
          <motion.div
            key={tmpl.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-all group cursor-pointer"
          >
            {/* Preview */}
            <div className="h-36 bg-zinc-800/30 flex items-center justify-center relative">
              <EnvelopeSimple size={40} className="text-zinc-700" weight="duotone" />
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700"><Eye size={14} className="text-zinc-400" /></button>
                <button className="p-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700"><Copy size={14} className="text-zinc-400" /></button>
                <button className="p-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700"><PencilSimple size={14} className="text-zinc-400" /></button>
              </div>
              {tmpl.starred && (
                <div className="absolute top-3 left-3">
                  <Star size={16} className="text-yellow-400" weight="fill" />
                </div>
              )}
            </div>
            {/* Info */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-medium text-white">{tmpl.name}</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">{tmpl.category}</span>
              </div>
              <p className="text-xs text-zinc-500 mb-3 truncate">{tmpl.subject}</p>
              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-3">
                  <span className="text-zinc-500">{tmpl.sends.toLocaleString('pt-BR')} envios</span>
                  <span className="text-emerald-400">{tmpl.openRate}% abertura</span>
                  <span className="text-blue-400">{tmpl.clickRate}% clique</span>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-zinc-600">
                <Clock size={12} />
                {tmpl.updated}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Create New */}
        <button className="bg-zinc-900/30 border border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-zinc-600 transition-colors min-h-[240px]">
          <Plus size={24} className="text-zinc-500" />
          <span className="text-sm text-zinc-500">Criar Template</span>
        </button>
      </div>
    </div>
  )
}

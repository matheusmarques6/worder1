'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  WhatsappLogo,
  Plus,
  MagnifyingGlass,
  Copy,
  PencilSimple,
  Eye,
  CheckCircle,
  Clock,
  ArrowLeft,
  Warning,
  Image,
  FileText,
  VideoCamera,
} from '@phosphor-icons/react'

const categories = ['Todos', 'Marketing', 'Transacional', 'Recovery', 'Utilidade']

const templates = [
  { id: '1', name: 'Carrinho Abandonado', category: 'Recovery', type: 'image', status: 'approved', preview: 'Olá {{nome}}! Notamos que você deixou itens no carrinho. Finalize sua compra com {{desconto}}% OFF! 🛒', sends: 6700, replyRate: 12.4, approved: true },
  { id: '2', name: 'Confirmação de Pedido', category: 'Transacional', type: 'text', status: 'approved', preview: '✅ {{nome}}, seu pedido #{{pedido}} foi confirmado! Valor: R$ {{valor}}. Acompanhe: {{link}}', sends: 18200, replyRate: 8.2, approved: true },
  { id: '3', name: 'PIX Pendente', category: 'Recovery', type: 'text', status: 'approved', preview: '⏰ {{nome}}, seu PIX de R$ {{valor}} expira em breve! Pague agora: {{link}}', sends: 4500, replyRate: 22.8, approved: true },
  { id: '4', name: 'Promoção Flash', category: 'Marketing', type: 'image', status: 'approved', preview: '🔥 {{nome}}, PROMOÇÃO RELÂMPAGO! {{desconto}}% OFF em toda a loja. Só hoje! Confira: {{link}}', sends: 8900, replyRate: 6.4, approved: true },
  { id: '5', name: 'Rastreamento de Pedido', category: 'Utilidade', type: 'text', status: 'approved', preview: '📦 {{nome}}, seu pedido #{{pedido}} está a caminho! Rastreie: {{link}}', sends: 14300, replyRate: 5.1, approved: true },
  { id: '6', name: 'Lançamento Coleção', category: 'Marketing', type: 'video', status: 'pending', preview: '✨ {{nome}}, chegou a nova coleção {{colecao}}! Seja o primeiro a conferir: {{link}}', sends: 0, replyRate: 0, approved: false },
  { id: '7', name: 'Cupom Aniversário', category: 'Marketing', type: 'image', status: 'approved', preview: '🎂 Feliz aniversário, {{nome}}! Presente especial: {{desconto}}% OFF com cupom {{cupom}}!', sends: 1200, replyRate: 15.6, approved: true },
  { id: '8', name: 'Boleto Pendente', category: 'Recovery', type: 'text', status: 'rejected', preview: '{{nome}}, seu boleto de R$ {{valor}} vence amanhã. Pague aqui: {{link}}', sends: 0, replyRate: 0, approved: false },
]

const typeIcons: Record<string, React.ComponentType<any>> = { text: FileText, image: Image, video: VideoCamera }
const statusConfig: Record<string, { label: string; color: string }> = {
  approved: { label: 'Aprovado', color: 'bg-emerald-500/10 text-emerald-400' },
  pending: { label: 'Em Revisão', color: 'bg-yellow-500/10 text-yellow-400' },
  rejected: { label: 'Rejeitado', color: 'bg-red-500/10 text-red-400' },
}

export default function WhatsAppTemplatesPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')

  const filtered = templates.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
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
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <WhatsappLogo size={22} className="text-green-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Templates WhatsApp</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Templates aprovados pela Meta para envio em massa</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
          <Plus size={16} />
          Novo Template
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
        <Warning size={18} className="text-yellow-400 mt-0.5" />
        <div>
          <p className="text-sm text-yellow-400 font-medium">Templates precisam de aprovação</p>
          <p className="text-xs text-zinc-500 mt-0.5">Todos os templates de WhatsApp Business precisam ser aprovados pela Meta antes do uso. O processo leva de 1 a 24 horas.</p>
        </div>
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
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500"
          />
        </div>
        <div className="flex gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                category === cat ? 'bg-green-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Templates */}
      <div className="space-y-3">
        {filtered.map((tmpl, i) => {
          const TypeIcon = typeIcons[tmpl.type] || FileText
          const status = statusConfig[tmpl.status]
          return (
            <motion.div
              key={tmpl.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-medium text-white">{tmpl.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${status.color}`}>{status.label}</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500 font-medium">{tmpl.category}</span>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 mb-3">
                    <p className="text-xs text-zinc-400 leading-relaxed">{tmpl.preview}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><TypeIcon size={12} /> {tmpl.type === 'text' ? 'Texto' : tmpl.type === 'image' ? 'Imagem' : 'Vídeo'}</span>
                    {tmpl.sends > 0 && <span>{tmpl.sends.toLocaleString('pt-BR')} envios</span>}
                    {tmpl.replyRate > 0 && <span className="text-emerald-400">{tmpl.replyRate}% resposta</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"><Eye size={16} className="text-zinc-500" /></button>
                  <button className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"><Copy size={16} className="text-zinc-500" /></button>
                  <button className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"><PencilSimple size={16} className="text-zinc-500" /></button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

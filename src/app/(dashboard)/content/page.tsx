'use client'

import { useState } from 'react'
import {
  EnvelopeSimple,
  WhatsappLogo,
  ShoppingBag,
  Image,
  Tag,
  Plus,
  MagnifyingGlass,
  FunnelSimple,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import Link from 'next/link'

const tabs = [
  { id: 'email-templates', label: 'Templates E-mail', icon: EnvelopeSimple, count: 24, href: '/content/templates' },
  { id: 'whatsapp-templates', label: 'Templates WhatsApp', icon: WhatsappLogo, count: 8, href: '/content/templates/whatsapp' },
  { id: 'products', label: 'Produtos', icon: ShoppingBag, count: 156, href: '/content/products' },
  { id: 'media', label: 'Mídia', icon: Image, count: 42, href: '/content/media' },
  { id: 'coupons', label: 'Cupons', icon: Tag, count: 12, href: '/content/coupons' },
]

const mockTemplates = [
  { id: '1', name: 'Boas-vindas', type: 'E-mail', category: 'Onboarding', used: 1240, thumbnail: null },
  { id: '2', name: 'Abandono de Carrinho', type: 'E-mail', category: 'Recovery', used: 890, thumbnail: null },
  { id: '3', name: 'Promoção Sazonal', type: 'E-mail', category: 'Promoção', used: 450, thumbnail: null },
  { id: '4', name: 'Confirmação de Pedido', type: 'WhatsApp', category: 'Transacional', used: 2100, thumbnail: null },
  { id: '5', name: 'Lembrete PIX', type: 'WhatsApp', category: 'Recovery', used: 670, thumbnail: null },
  { id: '6', name: 'Pós-Compra Review', type: 'E-mail', category: 'Pós-Venda', used: 320, thumbnail: null },
]

export default function ContentPage() {
  const [activeTab, setActiveTab] = useState('email-templates')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Conteúdo</h1>
          <p className="text-sm text-gray-500 mt-1">Templates, produtos, mídia e cupons</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#F26B2A]/20">
          <Plus className="w-4 h-4" weight="bold" />
          Novo Template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#1A1A1A] rounded-xl border border-white/[0.06] overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#F26B2A]' : ''}`} weight={isActive ? 'fill' : 'regular'} />
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                isActive ? 'bg-[#F26B2A]/15 text-[#F26B2A]' : 'bg-white/[0.06] text-gray-500'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar templates..."
            className="w-full bg-[#1A1A1A] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#F26B2A]/40 transition-colors"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1A] border border-white/[0.06] rounded-xl text-sm text-gray-500 hover:text-white transition-colors">
          <FunnelSimple className="w-4 h-4" />
          Filtros
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockTemplates.map((template) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden hover:border-[#F26B2A]/20 transition-all duration-200 cursor-pointer group"
          >
            {/* Thumbnail placeholder */}
            <div className="h-40 bg-[#111111] flex items-center justify-center group-hover:bg-[#151515] transition-colors">
              <EnvelopeSimple className="w-12 h-12 text-gray-300" weight="duotone" />
            </div>
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white">{template.name}</h3>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  template.type === 'WhatsApp' ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {template.type}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-500 font-medium">
                  {template.category}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">{template.used.toLocaleString()} envios</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

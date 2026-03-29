'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  EnvelopeSimple,
  WhatsappLogo,
  ShoppingBag,
  Image,
  Tag,
  Plus,
  MagnifyingGlass,
  FunnelSimple,
  SpinnerGap,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase'

interface Template {
  id: string
  name: string
  category: string | null
  thumbnail_url: string | null
  updated_at: string
  created_at: string
}

const tabs = [
  { id: 'email-templates', label: 'Templates E-mail', icon: EnvelopeSimple, href: '/content/templates' },
  { id: 'whatsapp-templates', label: 'Templates WhatsApp', icon: WhatsappLogo, href: '/content/templates/whatsapp' },
  { id: 'products', label: 'Produtos', icon: ShoppingBag, href: '/content/products' },
  { id: 'media', label: 'Mídia', icon: Image, href: '/content/media' },
  { id: 'coupons', label: 'Cupons', icon: Tag, href: '/content/coupons' },
]

export default function ContentPage() {
  const [activeTab, setActiveTab] = useState('email-templates')
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, category, thumbnail_url, updated_at, created_at')
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('Error fetching templates:', error.message)
        setTemplates([])
        return
      }
      setTemplates(data || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const tabCounts: Record<string, number> = {
    'email-templates': templates.length,
    'whatsapp-templates': 0,
    'products': 0,
    'media': 0,
    'coupons': 0,
  }

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
                {tabCounts[tab.id] ?? 0}
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

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <SpinnerGap className="w-8 h-8 text-[#F26B2A] animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <EnvelopeSimple className="w-16 h-16 text-gray-600 mb-4" weight="duotone" />
          <h3 className="text-lg font-semibold text-white mb-1">Nenhum template encontrado</h3>
          <p className="text-sm text-gray-500">Crie seu primeiro template para começar.</p>
        </div>
      )}

      {/* Grid */}
      {!loading && templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden hover:border-[#F26B2A]/20 transition-all duration-200 cursor-pointer group"
            >
              {/* Thumbnail placeholder */}
              <div className="h-40 bg-[#111111] flex items-center justify-center group-hover:bg-[#151515] transition-colors">
                {template.thumbnail_url ? (
                  <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover" />
                ) : (
                  <EnvelopeSimple className="w-12 h-12 text-gray-300" weight="duotone" />
                )}
              </div>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-white">{template.name}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">
                    E-mail
                  </span>
                  {template.category && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-500 font-medium">
                      {template.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Atualizado em {new Date(template.updated_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

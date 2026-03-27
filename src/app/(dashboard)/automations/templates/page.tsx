'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Lightning,
  ShoppingCartSimple,
  EnvelopeSimple,
  WhatsappLogo,
  Heart,
  Star,
  ArrowClockwise,
  UserPlus,
  Gift,
  Package,
  ChatCircle,
  DeviceMobileSpeaker,
  MagnifyingGlass,
  Plus,
  ArrowLeft,
  TrendUp,
  Barcode,
  CreditCard,
  PixLogo,
} from '@phosphor-icons/react'

const categories = [
  { id: 'all', label: 'Todos', count: 18 },
  { id: 'ecommerce', label: 'E-commerce', count: 8 },
  { id: 'recovery', label: 'Recuperação', count: 4 },
  { id: 'engagement', label: 'Engajamento', count: 3 },
  { id: 'support', label: 'Suporte', count: 3 },
]

const templates = [
  {
    id: 'welcome',
    name: 'Boas-vindas',
    description: 'Sequência de e-mails para novos assinantes com apresentação da marca e cupom',
    category: 'engagement',
    channels: ['email'],
    popularity: 95,
    trigger: 'Novo lead cadastrado',
  },
  {
    id: 'cart-abandoned',
    name: 'Carrinho Abandonado',
    description: 'Recuperação multicanal: WhatsApp + E-mail com incentivos progressivos',
    category: 'recovery',
    channels: ['whatsapp', 'email'],
    popularity: 98,
    trigger: 'Checkout abandonado',
  },
  {
    id: 'pix-pending',
    name: 'PIX Pendente',
    description: 'Lembrete automático com QR code e link de pagamento antes da expiração',
    category: 'recovery',
    channels: ['whatsapp'],
    popularity: 92,
    trigger: 'PIX gerado e não pago',
  },
  {
    id: 'boleto-pending',
    name: 'Boleto Pendente',
    description: 'Lembretes escalonados antes e após vencimento com opção de troca de pagamento',
    category: 'recovery',
    channels: ['whatsapp', 'email'],
    popularity: 88,
    trigger: 'Boleto emitido',
  },
  {
    id: 'card-declined',
    name: 'Cartão Recusado',
    description: 'Notificação ao cliente com link para tentar novamente com outro método',
    category: 'recovery',
    channels: ['whatsapp'],
    popularity: 85,
    trigger: 'Pagamento recusado',
  },
  {
    id: 'post-purchase',
    name: 'Pós-Compra',
    description: 'Confirmação + rastreamento + pesquisa de satisfação + cross-sell',
    category: 'ecommerce',
    channels: ['whatsapp', 'email'],
    popularity: 94,
    trigger: 'Pedido pago',
  },
  {
    id: 'winback',
    name: 'Win-back 60 dias',
    description: 'Reativação de clientes inativos com oferta personalizada',
    category: 'engagement',
    channels: ['email', 'whatsapp'],
    popularity: 86,
    trigger: '60 dias sem compra',
  },
  {
    id: 'birthday',
    name: 'Aniversário',
    description: 'Cupom especial de aniversário enviado automaticamente',
    category: 'engagement',
    channels: ['whatsapp', 'email'],
    popularity: 90,
    trigger: 'Data de aniversário',
  },
  {
    id: 'review-request',
    name: 'Solicitar Avaliação',
    description: 'NPS e review request após entrega confirmada',
    category: 'ecommerce',
    channels: ['whatsapp', 'email'],
    popularity: 82,
    trigger: 'Pedido entregue',
  },
  {
    id: 'cross-sell',
    name: 'Cross-sell',
    description: 'Recomendação de produtos complementares baseada em padrões de compra',
    category: 'ecommerce',
    channels: ['email'],
    popularity: 80,
    trigger: 'Pedido entregue (7d)',
  },
  {
    id: 'shipping-update',
    name: 'Atualização de Envio',
    description: 'Notificações automáticas: despachado, em trânsito, saiu para entrega, entregue',
    category: 'ecommerce',
    channels: ['whatsapp'],
    popularity: 96,
    trigger: 'Status do envio alterado',
  },
  {
    id: 'browse-abandon',
    name: 'Navegação Abandonada',
    description: 'E-mail com produtos vistos recentemente mas não adicionados ao carrinho',
    category: 'ecommerce',
    channels: ['email'],
    popularity: 78,
    trigger: 'Visitou produto sem comprar',
  },
]

const channelIcons: Record<string, { icon: typeof EnvelopeSimple; color: string }> = {
  email: { icon: EnvelopeSimple, color: '#3B82F6' },
  whatsapp: { icon: WhatsappLogo, color: '#25D366' },
  sms: { icon: DeviceMobileSpeaker, color: '#8B5CF6' },
  chat: { icon: ChatCircle, color: '#F26B2A' },
}

export default function AutomationTemplatesPage() {
  const router = useRouter()
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = templates.filter(t =>
    (activeCategory === 'all' || t.category === activeCategory) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/automations')}
          className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" weight="bold" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-display text-white">Templates de Automação</h1>
          <p className="text-sm text-gray-500 mt-0.5">Escolha um template para criar sua automação rapidamente</p>
        </div>
        <button
          onClick={() => router.push('/automations')}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.06] border border-white/[0.06] text-gray-600 text-sm font-medium rounded-xl hover:bg-white/[0.1] transition-colors"
        >
          <Plus className="w-4 h-4" weight="bold" />
          Criar do Zero
        </button>
      </div>

      {/* Categories */}
      <div className="flex items-center gap-1 p-1 bg-[#1A1A1A] rounded-xl border border-white/[0.06] w-fit">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeCategory === cat.id
                ? 'bg-white/[0.08] text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/[0.04]'
            }`}
          >
            {cat.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              activeCategory === cat.id ? 'bg-[#F26B2A]/15 text-[#F26B2A]' : 'bg-white/[0.06] text-gray-500'
            }`}>
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Buscar templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1A1A1A] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#F26B2A]/40 transition-colors"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((template, i) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-5 hover:border-[#F26B2A]/20 hover:bg-white/[0.01] transition-all duration-200 cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center group-hover:bg-[#F26B2A]/15 transition-colors">
                <Lightning className="w-5 h-5 text-[#F26B2A]" weight="fill" />
              </div>
              <div className="flex items-center gap-1">
                {template.channels.map((ch) => {
                  const config = channelIcons[ch]
                  if (!config) return null
                  const Icon = config.icon
                  return (
                    <div key={ch} className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: config.color }} weight="fill" />
                    </div>
                  )
                })}
              </div>
            </div>

            <h3 className="text-sm font-semibold text-white font-display">{template.name}</h3>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.description}</p>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.04]">
              <span className="text-[10px] text-gray-500">Trigger: {template.trigger}</span>
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-[#F5A623]" weight="fill" />
                <span className="text-[10px] font-medium text-gray-500">{template.popularity}%</span>
              </div>
            </div>

            <button className="w-full mt-3 px-4 py-2 bg-white/[0.04] hover:bg-[#F26B2A]/10 text-sm font-medium text-gray-600 hover:text-[#F26B2A] rounded-xl transition-all">
              Usar Template
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

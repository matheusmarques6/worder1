'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  EnvelopeSimple,
  Phone,
  WhatsappLogo,
  MapPin,
  Calendar,
  Tag,
  PencilSimple,
  Trash,
  DotsThree,
  Plus,
  ChatCircle,
  ShoppingCart,
  Eye,
  PaperPlaneTilt,
  CurrencyDollar,
  Clock,
  CheckCircle,
  XCircle,
  Star,
  Export,
  Copy,
  UserCircle,
  ListBullets,
  Note,
  ClipboardText,
  TrendUp,
  Package,
  CreditCard,
  ArrowSquareOut,
  Warning,
} from '@phosphor-icons/react'
import Link from 'next/link'

const mockContact = {
  id: '1',
  name: 'Maria Silva',
  email: 'maria.silva@email.com',
  phone: '+55 11 99999-1234',
  whatsapp: '+55 11 99999-1234',
  avatar: null,
  initials: 'MS',
  status: 'active',
  source: 'Shopify',
  createdAt: '2025-08-15T10:30:00Z',
  lastActivity: '2026-03-10T14:22:00Z',
  city: 'São Paulo, SP',
  tags: [
    { name: 'VIP', color: 'bg-yellow-500/10 text-yellow-400' },
    { name: 'Black Friday', color: 'bg-purple-500/10 text-purple-400' },
    { name: 'Recorrente', color: 'bg-emerald-500/10 text-emerald-400' },
  ],
  properties: [
    { label: 'Data de Nascimento', value: '15/03/1990' },
    { label: 'Gênero', value: 'Feminino' },
    { label: 'Empresa', value: 'Tech Solutions' },
    { label: 'Cargo', value: 'Gerente de Marketing' },
  ],
  lists: [
    { name: 'Todos os Contatos', count: 12450 },
    { name: 'Clientes VIP', count: 340 },
    { name: 'Black Friday 2025', count: 8200 },
  ],
  metrics: {
    totalOrders: 12,
    totalSpent: 4890.50,
    avgOrderValue: 407.54,
    lastOrderDate: '2026-03-05',
    emailsReceived: 48,
    emailsOpened: 38,
    emailsClicked: 22,
    openRate: 79.2,
    clickRate: 45.8,
  },
}

const timeline = [
  { id: '1', type: 'email_opened', title: 'Abriu e-mail "Novidades de Março"', time: '2h atrás', icon: Eye, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  { id: '2', type: 'purchase', title: 'Comprou "Tênis Runner Pro"', subtitle: 'Pedido #4521 · R$ 349,90', time: '2 dias atrás', icon: ShoppingCart, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  { id: '3', type: 'email_clicked', title: 'Clicou no link do e-mail "Esquenta Black Friday"', time: '5 dias atrás', icon: CurrencyDollar, color: 'text-[#F26B2A]', bgColor: 'bg-[#F26B2A]/10' },
  { id: '4', type: 'page_view', title: 'Visitou página /colecao/tenis', time: '5 dias atrás', icon: Eye, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  { id: '5', type: 'email_sent', title: 'Recebeu e-mail "Esquenta Black Friday"', time: '6 dias atrás', icon: PaperPlaneTilt, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  { id: '6', type: 'whatsapp', title: 'Mensagem WhatsApp enviada', subtitle: 'Confirmação de pedido #4480', time: '1 semana atrás', icon: WhatsappLogo, color: 'text-[#25D366]', bgColor: 'bg-[#25D366]/10' },
  { id: '7', type: 'purchase', title: 'Comprou "Camiseta Premium Algodão" (x2)', subtitle: 'Pedido #4480 · R$ 179,80', time: '1 semana atrás', icon: ShoppingCart, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  { id: '8', type: 'tag_added', title: 'Tag "VIP" adicionada automaticamente', subtitle: 'Automação: Clientes com 10+ compras', time: '2 semanas atrás', icon: Tag, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  { id: '9', type: 'email_opened', title: 'Abriu e-mail "Newsletter Fevereiro"', time: '3 semanas atrás', icon: Eye, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  { id: '10', type: 'form_submit', title: 'Preencheu formulário "Pesquisa de Satisfação"', subtitle: 'NPS: 9/10', time: '1 mês atrás', icon: ClipboardText, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
]

const orders = [
  { id: '#4521', date: '05/03/2026', total: 349.90, status: 'delivered', items: 1 },
  { id: '#4480', date: '28/02/2026', total: 179.80, status: 'delivered', items: 2 },
  { id: '#4312', date: '15/01/2026', total: 459.90, status: 'delivered', items: 1 },
  { id: '#4156', date: '20/12/2025', total: 890.50, status: 'delivered', items: 4 },
  { id: '#3980', date: '10/11/2025', total: 129.90, status: 'delivered', items: 1 },
]

const notes = [
  { id: '1', text: 'Cliente preferencial — sempre compra em promoções. Gosta de tênis e camisetas.', author: 'Ana Costa', date: '10/03/2026' },
  { id: '2', text: 'Solicitou troca do pedido #4312, resolvido com sucesso.', author: 'Carlos Lima', date: '18/01/2026' },
]

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400' },
  inactive: { label: 'Inativo', color: 'bg-zinc-500/10 text-zinc-400' },
  unsubscribed: { label: 'Descadastrado', color: 'bg-red-500/10 text-red-400' },
  bounced: { label: 'Bounced', color: 'bg-yellow-500/10 text-yellow-400' },
}

const orderStatusConfig: Record<string, { label: string; color: string }> = {
  delivered: { label: 'Entregue', color: 'text-emerald-400' },
  shipped: { label: 'Enviado', color: 'text-blue-400' },
  pending: { label: 'Pendente', color: 'text-yellow-400' },
  cancelled: { label: 'Cancelado', color: 'text-red-400' },
}

export default function ContactDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes' | 'tasks'>('timeline')
  const contact = mockContact
  const status = statusConfig[contact.status] || statusConfig.active

  const tabs = [
    { id: 'timeline' as const, label: 'Timeline' },
    { id: 'notes' as const, label: 'Notas' },
    { id: 'tasks' as const, label: 'Tarefas' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/contacts')}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">{contact.name}</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Contato desde {new Date(contact.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <PencilSimple size={14} />
            Editar
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <Export size={14} />
            Exportar
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 text-xs font-medium">
            <PaperPlaneTilt size={14} />
            Enviar E-mail
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel — Contact Info */}
        <div className="space-y-4">
          {/* Avatar & Basic Info */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#F26B2A] to-[#F5A623] flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-white">{contact.initials}</span>
              </div>
              <h2 className="text-lg font-bold text-white">{contact.name}</h2>
              <span className={`mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                {status.label}
              </span>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <EnvelopeSimple size={16} className="text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-300 truncate">{contact.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-300">{contact.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <WhatsappLogo size={16} className="text-[#25D366] flex-shrink-0" />
                <span className="text-sm text-zinc-300">{contact.whatsapp}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-300">{contact.city}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-300">Origem: {contact.source}</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Tag size={14} className="text-[#F26B2A]" />
                Tags
              </h3>
              <button className="p-1 rounded hover:bg-zinc-800 transition-colors">
                <Plus size={14} className="text-zinc-500" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {contact.tags.map((tag) => (
                <span key={tag.name} className={`px-2.5 py-1 rounded-full text-xs font-medium ${tag.color}`}>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>

          {/* Properties */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Propriedades</h3>
              <button className="p-1 rounded hover:bg-zinc-800 transition-colors">
                <PencilSimple size={14} className="text-zinc-500" />
              </button>
            </div>
            <div className="space-y-3">
              {contact.properties.map((prop) => (
                <div key={prop.label}>
                  <p className="text-xs text-zinc-500">{prop.label}</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{prop.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lists */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <ListBullets size={14} className="text-[#F26B2A]" />
              Listas
            </h3>
            <div className="space-y-2">
              {contact.lists.map((list) => (
                <div key={list.name} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-300">{list.name}</span>
                  <span className="text-xs text-zinc-600">{list.count.toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center — Timeline/Notes/Tasks */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex border-b border-zinc-800">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="contactTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F26B2A]"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'timeline' && (
                <div className="space-y-1">
                  {timeline.map((event, i) => {
                    const Icon = event.icon
                    return (
                      <div key={event.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full ${event.bgColor} flex items-center justify-center flex-shrink-0`}>
                            <Icon size={16} className={event.color} weight="fill" />
                          </div>
                          {i < timeline.length - 1 && <div className="w-px h-full bg-zinc-800 min-h-[24px]" />}
                        </div>
                        <div className="pb-5">
                          <p className="text-sm text-white">{event.title}</p>
                          {event.subtitle && <p className="text-xs text-zinc-500 mt-0.5">{event.subtitle}</p>}
                          <p className="text-xs text-zinc-600 mt-1 flex items-center gap-1">
                            <Clock size={10} />
                            {event.time}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Adicionar uma nota..."
                      className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
                    />
                    <button className="px-4 py-2 bg-[#F26B2A] text-white text-sm rounded-lg hover:opacity-90">
                      Salvar
                    </button>
                  </div>
                  {notes.map((note) => (
                    <div key={note.id} className="bg-zinc-800/30 rounded-lg p-4">
                      <p className="text-sm text-zinc-300 leading-relaxed">{note.text}</p>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-xs text-zinc-500">{note.author}</span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-600">{note.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Adicionar uma tarefa..."
                      className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
                    />
                    <button className="px-4 py-2 bg-[#F26B2A] text-white text-sm rounded-lg hover:opacity-90">
                      Criar
                    </button>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-4 flex items-start gap-3">
                    <CheckCircle size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" weight="fill" />
                    <div>
                      <p className="text-sm text-zinc-400 line-through">Enviar e-mail de boas-vindas VIP</p>
                      <p className="text-xs text-zinc-600 mt-1">Concluída em 01/03/2026 · Ana Costa</p>
                    </div>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-4 flex items-start gap-3">
                    <div className="w-[18px] h-[18px] rounded-full border-2 border-zinc-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-white">Ligar para confirmar interesse em nova coleção</p>
                      <p className="text-xs text-zinc-600 mt-1">Prazo: 15/03/2026 · Carlos Lima</p>
                    </div>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-4 flex items-start gap-3">
                    <div className="w-[18px] h-[18px] rounded-full border-2 border-zinc-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-white">Agendar reunião para parceria B2B</p>
                      <p className="text-xs text-zinc-600 mt-1">Prazo: 20/03/2026 · Ana Costa</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel — Orders & Metrics */}
        <div className="space-y-4">
          {/* Engagement Metrics */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Engajamento</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">E-mails recebidos</span>
                <span className="text-sm text-white font-medium">{contact.metrics.emailsReceived}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Taxa de abertura</span>
                <span className="text-sm text-emerald-400 font-medium">{contact.metrics.openRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Taxa de cliques</span>
                <span className="text-sm text-[#F26B2A] font-medium">{contact.metrics.clickRate}%</span>
              </div>
              <div className="w-full h-px bg-zinc-800 my-1" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Aberturas</span>
                <div className="flex-1 mx-3">
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${contact.metrics.openRate}%` }} />
                  </div>
                </div>
                <span className="text-xs text-zinc-400">{contact.metrics.emailsOpened}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Cliques</span>
                <div className="flex-1 mx-3">
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[#F26B2A] rounded-full" style={{ width: `${contact.metrics.clickRate}%` }} />
                  </div>
                </div>
                <span className="text-xs text-zinc-400">{contact.metrics.emailsClicked}</span>
              </div>
            </div>
          </div>

          {/* Lifetime Value */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <TrendUp size={14} className="text-emerald-400" />
              Valor do Cliente
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-800/30 rounded-lg p-3">
                <p className="text-xs text-zinc-500">Total Gasto</p>
                <p className="text-lg font-bold text-white mt-1">R$ {contact.metrics.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-3">
                <p className="text-xs text-zinc-500">Pedidos</p>
                <p className="text-lg font-bold text-white mt-1">{contact.metrics.totalOrders}</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-3 col-span-2">
                <p className="text-xs text-zinc-500">Ticket Médio</p>
                <p className="text-lg font-bold text-[#F26B2A] mt-1">R$ {contact.metrics.avgOrderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          {/* Recent Orders */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShoppingCart size={14} className="text-[#F26B2A]" />
                Pedidos Recentes
              </h3>
              <Link href="/recovery" className="text-xs text-[#F26B2A] hover:text-[#F5A623] transition-colors">
                Ver todos
              </Link>
            </div>
            <div className="space-y-3">
              {orders.map((order) => {
                const orderStatus = orderStatusConfig[order.status] || orderStatusConfig.pending
                return (
                  <div key={order.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                    <div>
                      <p className="text-sm text-white font-medium">{order.id}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">{order.date} · {order.items} {order.items === 1 ? 'item' : 'itens'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white font-medium">R$ {order.total.toFixed(2)}</p>
                      <p className={`text-xs ${orderStatus.color}`}>{orderStatus.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

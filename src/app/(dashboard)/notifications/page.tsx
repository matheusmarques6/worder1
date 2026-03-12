'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Check,
  CheckCircle,
  Trash,
  MagnifyingGlass,
  FunnelSimple,
  ShoppingBag,
  ChatCircle,
  Warning,
  WarningCircle,
  Info,
  ArrowSquareOut,
  Clock,
  EnvelopeSimple,
  Lightning,
  Megaphone,
} from '@phosphor-icons/react'
import { useAuthStore } from '@/stores'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Notification {
  id: string
  type: string
  category: string
  priority: string
  title: string
  message: string
  data: { integration_type?: string }
  action_url?: string
  action_label?: string
  read: boolean
  created_at: string
}

const categoryConfig: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  integration: { label: 'Integrações', icon: ShoppingBag, color: 'text-[#95BF47]' },
  campaign: { label: 'Campanhas', icon: Megaphone, color: 'text-blue-400' },
  automation: { label: 'Automações', icon: Lightning, color: 'text-[#F26B2A]' },
  system: { label: 'Sistema', icon: Info, color: 'text-zinc-400' },
  alert: { label: 'Alertas', icon: Warning, color: 'text-yellow-400' },
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgente', color: 'bg-red-500/10 text-red-400' },
  high: { label: 'Alta', color: 'bg-yellow-500/10 text-yellow-400' },
  normal: { label: 'Normal', color: 'bg-blue-500/10 text-blue-400' },
  low: { label: 'Baixa', color: 'bg-zinc-500/10 text-zinc-400' },
}

// Mock data for when API is not available
const mockNotifications: Notification[] = [
  { id: '1', type: 'integration', category: 'integration', priority: 'high', title: 'Shopify sincronizado', message: '156 produtos e 2.450 pedidos sincronizados com sucesso.', data: { integration_type: 'shopify' }, action_url: '/integrations', action_label: 'Ver integrações', read: false, created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
  { id: '2', type: 'campaign', category: 'campaign', priority: 'normal', title: 'Campanha "Black Friday" enviada', message: '12.450 e-mails enviados com 98.9% de entrega. Taxa de abertura: 32.1%.', data: {}, action_url: '/campaigns/1', action_label: 'Ver relatório', read: false, created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  { id: '3', type: 'automation', category: 'automation', priority: 'normal', title: 'Automação "Carrinho Abandonado" ativada', message: 'A automação está ativa e monitorando carrinhos abandonados em tempo real.', data: {}, action_url: '/automations', action_label: 'Ver automação', read: false, created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
  { id: '4', type: 'alert', category: 'alert', priority: 'urgent', title: 'Taxa de bounce alta detectada', message: 'A campanha "Newsletter Março" teve 4.2% de bounce, acima do limite de 3%.', data: {}, action_url: '/campaigns/2', action_label: 'Investigar', read: true, created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString() },
  { id: '5', type: 'system', category: 'system', priority: 'low', title: 'Backup diário concluído', message: 'Todos os dados foram salvos com sucesso. Próximo backup em 24h.', data: {}, read: true, created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() },
  { id: '6', type: 'integration', category: 'integration', priority: 'normal', title: 'WhatsApp Business conectado', message: 'Número +55 11 9XXXX-XXXX conectado e pronto para envio.', data: { integration_type: 'whatsapp' }, action_url: '/whatsapp', action_label: 'Configurar', read: true, created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
  { id: '7', type: 'campaign', category: 'campaign', priority: 'normal', title: 'Campanha SMS agendada', message: '"Flash Sale 50% OFF" será enviada em 15 Mar às 10:00 para 4.200 contatos.', data: {}, action_url: '/sms', action_label: 'Ver SMS', read: true, created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString() },
  { id: '8', type: 'automation', category: 'automation', priority: 'high', title: 'PIX Pendente recuperou R$ 2.400', message: '18 pagamentos PIX foram completados nas últimas 24h através da automação.', data: {}, action_url: '/recovery', action_label: 'Ver recuperação', read: true, created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
]

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = notifications.filter((n) => {
    const matchFilter = filter === 'all' || (filter === 'unread' && !n.read) || (filter === 'read' && n.read)
    const matchCategory = categoryFilter === 'all' || n.category === categoryFilter
    const matchSearch = !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.message.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchCategory && matchSearch
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (ids: string[]) => {
    setNotifications((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, read: true } : n))
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const getIcon = (notification: Notification) => {
    const type = notification.data?.integration_type
    if (type === 'shopify') return <ShoppingBag size={18} className="text-[#95BF47]" weight="fill" />
    if (type === 'whatsapp') return <ChatCircle size={18} className="text-[#25D366]" weight="fill" />
    switch (notification.priority) {
      case 'urgent': return <WarningCircle size={18} className="text-red-400" weight="fill" />
      case 'high': return <Warning size={18} className="text-yellow-400" weight="fill" />
      default: return <Info size={18} className="text-blue-400" weight="fill" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center">
            <Bell size={22} className="text-[#F26B2A]" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Notificações</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Todas lidas'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm transition-colors"
          >
            <CheckCircle size={16} />
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar notificações..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
          />
        </div>
        <div className="flex gap-1">
          {[
            { id: 'all' as const, label: 'Todas' },
            { id: 'unread' as const, label: `Não lidas (${unreadCount})` },
            { id: 'read' as const, label: 'Lidas' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filter === f.id ? 'bg-[#F26B2A] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Todas' },
            ...Object.entries(categoryConfig).map(([id, cfg]) => ({ id, label: cfg.label })),
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                categoryFilter === c.id ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
              <Bell size={32} className="text-zinc-700 mx-auto mb-3" weight="duotone" />
              <p className="text-sm text-zinc-400">Nenhuma notificação encontrada</p>
              <p className="text-xs text-zinc-600 mt-1">Ajuste os filtros ou aguarde novas notificações</p>
            </div>
          ) : (
            filtered.map((notification, i) => {
              const priority = priorityConfig[notification.priority] || priorityConfig.normal
              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.02 }}
                  className={`bg-zinc-900/50 border rounded-xl p-5 transition-all ${
                    notification.read ? 'border-zinc-800' : 'border-[#F26B2A]/20 bg-[#F26B2A]/[0.02]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex-shrink-0">{getIcon(notification)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`text-sm font-medium ${notification.read ? 'text-zinc-300' : 'text-white'}`}>
                              {notification.title}
                            </h4>
                            {!notification.read && <span className="w-2 h-2 rounded-full bg-[#F26B2A] flex-shrink-0" />}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priority.color}`}>
                              {priority.label}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400 leading-relaxed">{notification.message}</p>
                          <div className="flex items-center gap-4 mt-3">
                            <span className="text-xs text-zinc-600 flex items-center gap-1">
                              <Clock size={12} />
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                            </span>
                            {notification.action_url && (
                              <a href={notification.action_url} className="text-xs text-[#F26B2A] hover:text-[#F5A623] flex items-center gap-1 transition-colors">
                                {notification.action_label || 'Ver mais'}
                                <ArrowSquareOut size={12} weight="bold" />
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead([notification.id])}
                              className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Marcar como lida"
                            >
                              <Check size={14} weight="bold" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash size={14} weight="bold" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
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
  Plus,
  ShoppingCart,
  Eye,
  PaperPlaneTilt,
  CurrencyDollar,
  Clock,
  CheckCircle,
  Export,
  UserCircle,
  ListBullets,
  ClipboardText,
  TrendUp,
  ChatCircle,
  Warning,
  Lightning,
  Trash,
  ArrowsClockwise,
  Megaphone,
  CursorClick,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { useInboxContact } from '@/hooks/useInboxContact'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { InboxContact, InboxActivity, InboxNote, InboxTask, InboxOrder, InboxDeal } from '@/types/inbox'

const activityIconMap: Record<string, { icon: React.ComponentType<any>; color: string; bgColor: string }> = {
  conversation_started: { icon: ChatCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  conversation_closed: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  message_sent: { icon: PaperPlaneTilt, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  message_received: { icon: ChatCircle, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  tag_added: { icon: Tag, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  tag_removed: { icon: Tag, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  deal_created: { icon: CurrencyDollar, color: 'text-[#F26B2A]', bgColor: 'bg-[#F26B2A]/10' },
  deal_won: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  deal_lost: { icon: Warning, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  deal_stage_changed: { icon: TrendUp, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  order_placed: { icon: ShoppingCart, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  order_fulfilled: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  cart_abandoned: { icon: ShoppingCart, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  cart_recovered: { icon: ShoppingCart, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  task_created: { icon: ClipboardText, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  task_completed: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  note_added: { icon: PencilSimple, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  comment_added: { icon: PencilSimple, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  contact_created: { icon: UserCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  contact_updated: { icon: PencilSimple, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  campaign_sent: { icon: Megaphone, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  campaign_clicked: { icon: CursorClick, color: 'text-[#F26B2A]', bgColor: 'bg-[#F26B2A]/10' },
  bot_interaction: { icon: Lightning, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  blocked: { icon: Warning, color: 'text-red-400', bgColor: 'bg-red-500/10' },
}

const defaultActivityIcon = { icon: Eye, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' }

const tagColors = [
  'bg-yellow-500/10 text-yellow-400',
  'bg-purple-500/10 text-purple-400',
  'bg-emerald-500/10 text-emerald-400',
  'bg-blue-500/10 text-blue-400',
  'bg-red-500/10 text-red-400',
  'bg-pink-500/10 text-pink-400',
  'bg-cyan-500/10 text-cyan-400',
]

const orderStatusConfig: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'text-emerald-400' },
  fulfilled: { label: 'Entregue', color: 'text-emerald-400' },
  partially_fulfilled: { label: 'Parcial', color: 'text-yellow-400' },
  pending: { label: 'Pendente', color: 'text-yellow-400' },
  refunded: { label: 'Reembolsado', color: 'text-red-400' },
  cancelled: { label: 'Cancelado', color: 'text-red-400' },
  authorized: { label: 'Autorizado', color: 'text-blue-400' },
}

function getContactName(c: InboxContact): string {
  if (c.full_name) return c.full_name
  if (c.name) return c.name
  if (c.first_name || c.last_name) return `${c.first_name || ''} ${c.last_name || ''}`.trim()
  if (c.profile_name) return c.profile_name
  return c.email || c.phone_number || 'Sem nome'
}

function getInitials(c: InboxContact): string {
  const name = getContactName(c)
  const parts = name.split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.[0] || '?').toUpperCase()
}

function getCity(c: InboxContact): string | null {
  if (!c.address) return null
  const parts = [c.address.city, c.address.state].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

export default function ContactDetailPage() {
  const router = useRouter()
  const params = useParams()
  const contactId = params.id as string
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes' | 'tasks'>('timeline')
  const [noteText, setNoteText] = useState('')

  const {
    contact,
    notes,
    activities,
    orders,
    deals,
    tasks,
    isLoading,
    error,
    fetchContact,
    addNote,
    deleteNote,
    addTag,
    removeTag,
    createTask,
    completeTask,
    deleteTask,
  } = useInboxContact()

  useEffect(() => {
    if (contactId) {
      fetchContact(contactId)
    }
  }, [contactId, fetchContact])

  const handleAddNote = async () => {
    if (!noteText.trim() || !contactId) return
    try {
      await addNote(contactId, noteText.trim())
      setNoteText('')
    } catch (err) {
      console.error('Error adding note:', err)
    }
  }

  const tabs = [
    { id: 'timeline' as const, label: 'Timeline' },
    { id: 'notes' as const, label: `Notas${notes.length > 0 ? ` (${notes.length})` : ''}` },
    { id: 'tasks' as const, label: `Tarefas${tasks.length > 0 ? ` (${tasks.length})` : ''}` },
  ]

  // Loading state
  if (isLoading && !contact) {
    return (
      <div className="flex items-center justify-center py-32">
        <ArrowsClockwise size={32} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  // Error state
  if (error && !contact) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/contacts')} className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={18} weight="bold" />
          </button>
          <h1 className="text-2xl font-bold font-display text-white">Contato</h1>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
          <Warning size={32} className="text-red-400 mx-auto mb-3" weight="duotone" />
          <p className="text-sm text-zinc-400">Erro ao carregar contato</p>
          <p className="text-xs text-zinc-600 mt-1">{error}</p>
          <button onClick={() => fetchContact(contactId)} className="mt-4 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm">
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!contact) return null

  const contactName = getContactName(contact)
  const initials = getInitials(contact)
  const city = getCity(contact)
  const totalSpent = contact.total_spent || contact.lifetime_value || 0
  const totalOrders = contact.total_orders || 0
  const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0

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
            <h1 className="text-2xl font-bold font-display text-white">{contactName}</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Contato desde {new Date(contact.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
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
              {contact.avatar_url || contact.profile_picture_url ? (
                <img
                  src={contact.avatar_url || contact.profile_picture_url}
                  alt={contactName}
                  className="w-20 h-20 rounded-full object-cover mb-4"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#F26B2A] to-[#F5A623] flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-white">{initials}</span>
                </div>
              )}
              <h2 className="text-lg font-bold text-white">{contactName}</h2>
              {contact.company && (
                <p className="text-xs text-zinc-500 mt-0.5">{contact.position ? `${contact.position} · ` : ''}{contact.company}</p>
              )}
              <span className={`mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${
                contact.is_blocked
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {contact.is_blocked ? 'Bloqueado' : 'Ativo'}
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {contact.email && (
                <div className="flex items-center gap-3">
                  <EnvelopeSimple size={16} className="text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-300 truncate">{contact.email}</span>
                </div>
              )}
              {(contact.phone || contact.phone_number) && (
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-300">{contact.phone || contact.phone_number}</span>
                </div>
              )}
              {(contact.whatsapp || contact.phone_number) && (
                <div className="flex items-center gap-3">
                  <WhatsappLogo size={16} className="text-[#25D366] flex-shrink-0" />
                  <span className="text-sm text-zinc-300">{contact.whatsapp || contact.phone_number}</span>
                </div>
              )}
              {city && (
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-300">{city}</span>
                </div>
              )}
              {contact.source && (
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-300">Origem: {contact.source}</span>
                </div>
              )}
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
            {contact.tags && contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((tag, i) => (
                  <span
                    key={tag}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${tagColors[i % tagColors.length]}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Nenhuma tag adicionada</p>
            )}
          </div>

          {/* Custom Fields */}
          {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Propriedades</h3>
                <button className="p-1 rounded hover:bg-zinc-800 transition-colors">
                  <PencilSimple size={14} className="text-zinc-500" />
                </button>
              </div>
              <div className="space-y-3">
                {Object.entries(contact.custom_fields).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs text-zinc-500">{key}</p>
                    <p className="text-sm text-zinc-300 mt-0.5">{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subscriptions */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <ListBullets size={14} className="text-[#F26B2A]" />
              Canais
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-zinc-300 flex items-center gap-2">
                  <EnvelopeSimple size={14} className="text-zinc-500" /> E-mail
                </span>
                <span className={`text-xs ${contact.is_subscribed_email !== false ? 'text-emerald-400' : 'text-zinc-600'}`}>
                  {contact.is_subscribed_email !== false ? 'Inscrito' : 'Não inscrito'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-zinc-300 flex items-center gap-2">
                  <WhatsappLogo size={14} className="text-[#25D366]" /> WhatsApp
                </span>
                <span className={`text-xs ${contact.is_subscribed_whatsapp !== false ? 'text-emerald-400' : 'text-zinc-600'}`}>
                  {contact.is_subscribed_whatsapp !== false ? 'Inscrito' : 'Não inscrito'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-zinc-300 flex items-center gap-2">
                  <Phone size={14} className="text-zinc-500" /> SMS
                </span>
                <span className={`text-xs ${contact.is_subscribed_sms ? 'text-emerald-400' : 'text-zinc-600'}`}>
                  {contact.is_subscribed_sms ? 'Inscrito' : 'Não inscrito'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center — Timeline/Notes/Tasks */}
        <div className="lg:col-span-2 space-y-4">
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
              {/* Timeline Tab */}
              {activeTab === 'timeline' && (
                <div className="space-y-1">
                  {activities.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock size={24} className="text-zinc-700 mx-auto mb-2" weight="duotone" />
                      <p className="text-sm text-zinc-500">Nenhuma atividade registrada</p>
                    </div>
                  ) : (
                    activities.map((activity, i) => {
                      const iconCfg = activityIconMap[activity.activity_type] || defaultActivityIcon
                      const Icon = iconCfg.icon
                      return (
                        <div key={activity.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full ${iconCfg.bgColor} flex items-center justify-center flex-shrink-0`}>
                              <Icon size={16} className={iconCfg.color} weight="fill" />
                            </div>
                            {i < activities.length - 1 && <div className="w-px h-full bg-zinc-800 min-h-[24px]" />}
                          </div>
                          <div className="pb-5">
                            <p className="text-sm text-white">{activity.title}</p>
                            {activity.description && <p className="text-xs text-zinc-500 mt-0.5">{activity.description}</p>}
                            <p className="text-xs text-zinc-600 mt-1 flex items-center gap-1">
                              <Clock size={10} />
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* Notes Tab */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Adicionar uma nota..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!noteText.trim()}
                      className="px-4 py-2 bg-[#F26B2A] text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                  {notes.length === 0 ? (
                    <div className="text-center py-8">
                      <PencilSimple size={24} className="text-zinc-700 mx-auto mb-2" weight="duotone" />
                      <p className="text-sm text-zinc-500">Nenhuma nota adicionada</p>
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className="bg-zinc-800/30 rounded-lg p-4 group">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-zinc-300 leading-relaxed flex-1">{note.content}</p>
                          <button
                            onClick={() => deleteNote(contactId, note.id)}
                            className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="text-xs text-zinc-500">{note.created_by_name || 'Sistema'}</span>
                          <span className="text-xs text-zinc-600">·</span>
                          <span className="text-xs text-zinc-600">
                            {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tasks Tab */}
              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  {tasks.length === 0 ? (
                    <div className="text-center py-8">
                      <ClipboardText size={24} className="text-zinc-700 mx-auto mb-2" weight="duotone" />
                      <p className="text-sm text-zinc-500">Nenhuma tarefa criada</p>
                    </div>
                  ) : (
                    tasks.map((task) => {
                      const isCompleted = task.status === 'completed'
                      return (
                        <div key={task.id} className="bg-zinc-800/30 rounded-lg p-4 flex items-start gap-3 group">
                          {isCompleted ? (
                            <CheckCircle size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" weight="fill" />
                          ) : (
                            <button
                              onClick={() => completeTask(task.id)}
                              className="w-[18px] h-[18px] rounded-full border-2 border-zinc-600 mt-0.5 flex-shrink-0 hover:border-emerald-400 transition-colors"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${isCompleted ? 'text-zinc-400 line-through' : 'text-white'}`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-zinc-600 mt-0.5">{task.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              {task.due_date && (
                                <span className={`text-xs ${task.is_overdue ? 'text-red-400' : 'text-zinc-600'}`}>
                                  Prazo: {new Date(task.due_date).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                              {task.assigned_to_name && (
                                <span className="text-xs text-zinc-600">· {task.assigned_to_name}</span>
                              )}
                              {isCompleted && task.completed_at && (
                                <span className="text-xs text-zinc-600">
                                  Concluída {formatDistanceToNow(new Date(task.completed_at), { addSuffix: true, locale: ptBR })}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      )
                    })
                  )}
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
                <span className="text-xs text-zinc-500">Total de mensagens</span>
                <span className="text-sm text-white font-medium">{contact.total_messages_sent + contact.total_messages_received}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Mensagens enviadas</span>
                <span className="text-sm text-blue-400 font-medium">{contact.total_messages_sent}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Mensagens recebidas</span>
                <span className="text-sm text-emerald-400 font-medium">{contact.total_messages_received}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Conversas</span>
                <span className="text-sm text-[#F26B2A] font-medium">{contact.total_conversations}</span>
              </div>
              {contact.last_message_at && (
                <>
                  <div className="w-full h-px bg-zinc-800 my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Última mensagem</span>
                    <span className="text-xs text-zinc-400">
                      {formatDistanceToNow(new Date(contact.last_message_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </>
              )}
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
                <p className="text-lg font-bold text-white mt-1">
                  R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-3">
                <p className="text-xs text-zinc-500">Pedidos</p>
                <p className="text-lg font-bold text-white mt-1">{totalOrders}</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-3 col-span-2">
                <p className="text-xs text-zinc-500">Ticket Médio</p>
                <p className="text-lg font-bold text-[#F26B2A] mt-1">
                  R$ {avgOrder.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Deals */}
          {deals.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <CurrencyDollar size={14} className="text-[#F26B2A]" />
                Negociações
              </h3>
              <div className="space-y-3">
                {deals.slice(0, 5).map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                    <div>
                      <p className="text-sm text-white font-medium">{deal.title}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {deal.stage?.name || 'Sem etapa'} · {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Aberto'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white font-medium">R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className={`text-xs ${deal.status === 'won' ? 'text-emerald-400' : deal.status === 'lost' ? 'text-red-400' : 'text-blue-400'}`}>
                        {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Aberto'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Orders */}
          {orders.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShoppingCart size={14} className="text-[#F26B2A]" />
                  Pedidos Recentes
                </h3>
              </div>
              <div className="space-y-3">
                {orders.slice(0, 5).map((order) => {
                  const status = orderStatusConfig[order.financial_status] || orderStatusConfig[order.fulfillment_status || ''] || { label: order.financial_status, color: 'text-zinc-400' }
                  return (
                    <div key={order.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                      <div>
                        <p className="text-sm text-white font-medium">#{order.order_number}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString('pt-BR')} · {order.line_items?.length || 0} {(order.line_items?.length || 0) === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-white font-medium">
                          {order.currency === 'BRL' ? 'R$ ' : `${order.currency} `}{order.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className={`text-xs ${status.color}`}>{status.label}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Mail,
  Phone,
  Building2,
  Tag,
  Plus,
  ShoppingCart,
  DollarSign,
  Package,
  MessageSquare,
  Eye,
  Clock,
  Trash2,
} from 'lucide-react'
import type { Contact } from '@/types'

// Predefined tag colors
const TAG_COLORS: Record<string, string> = {
  cliente: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  vip: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  prospect: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  inativo: 'bg-red-500/20 text-red-400 border-red-500/30',
  novo: 'bg-green-500/20 text-green-400 border-green-500/30',
  recorrente: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  default: 'bg-dark-600/50 text-dark-300 border-dark-500/30',
}

// Suggested tags
const SUGGESTED_TAGS = ['cliente', 'vip', 'lead', 'prospect', 'novo', 'recorrente', 'inativo']

// Mock activity data (in real app, this would come from API)
const getMockActivities = (contact: Contact) => [
  {
    id: '1',
    type: 'order',
    icon: ShoppingCart,
    title: 'Fez um pedido #12345',
    date: contact.last_order_at || new Date().toISOString(),
    color: 'text-cyan-400 bg-cyan-500/20',
  },
  {
    id: '2',
    type: 'email',
    icon: Mail,
    title: 'Abriu e-mail "Novidades de Janeiro"',
    date: new Date(Date.now() - 86400000).toISOString(),
    color: 'text-blue-400 bg-blue-500/20',
  },
  {
    id: '3',
    type: 'visit',
    icon: Eye,
    title: 'Visitou a página de produtos',
    date: new Date(Date.now() - 172800000).toISOString(),
    color: 'text-purple-400 bg-purple-500/20',
  },
  {
    id: '4',
    type: 'whatsapp',
    icon: MessageSquare,
    title: 'Conversou pelo WhatsApp',
    date: new Date(Date.now() - 432000000).toISOString(),
    color: 'text-green-400 bg-green-500/20',
  },
]

interface ContactDrawerProps {
  contact: Contact | null
  onClose: () => void
  onUpdateTags: (contactId: string, tags: string[]) => Promise<void>
}

export function ContactDrawer({ contact, onClose, onUpdateTags }: ContactDrawerProps) {
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [savingTags, setSavingTags] = useState(false)

  if (!contact) return null

  const activities = getMockActivities(contact)
  const initials = `${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || '?'
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Sem nome'

  const getTagColor = (tag: string) => {
    return TAG_COLORS[tag.toLowerCase()] || TAG_COLORS.default
  }

  const handleAddTag = async (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase()
    if (!trimmedTag || contact.tags?.includes(trimmedTag)) return

    setSavingTags(true)
    try {
      const newTags = [...(contact.tags || []), trimmedTag]
      await onUpdateTags(contact.id, newTags)
      setNewTag('')
      setShowTagInput(false)
    } catch (error) {
      console.error('Error adding tag:', error)
    } finally {
      setSavingTags(false)
    }
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    setSavingTags(true)
    try {
      const newTags = (contact.tags || []).filter(t => t !== tagToRemove)
      await onUpdateTags(contact.id, newTags)
    } catch (error) {
      console.error('Error removing tag:', error)
    } finally {
      setSavingTags(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR')
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  // Filter suggested tags that are not already added
  const availableSuggestions = SUGGESTED_TAGS.filter(
    tag => !contact.tags?.includes(tag)
  )

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex justify-end"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="relative w-full max-w-md bg-dark-900 border-l border-dark-700/50 shadow-2xl overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur-xl border-b border-dark-700/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">Informações do Contato</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar & Name */}
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 ring-4 ring-dark-800">
                <span className="text-2xl font-bold text-white">{initials}</span>
              </div>
              <h3 className="text-xl font-bold text-white">{fullName}</h3>
              {contact.phone && (
                <p className="text-dark-400 mt-1">{contact.phone}</p>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Contact Info */}
            <div className="space-y-3">
              {contact.email && (
                <div className="flex items-center gap-3 text-dark-300">
                  <Mail className="w-4 h-4 text-dark-500" />
                  <span>{contact.email}</span>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-3 text-dark-300">
                  <Building2 className="w-4 h-4 text-dark-500" />
                  <span>{contact.company}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Tags</span>
                <button
                  onClick={() => setShowTagInput(!showTagInput)}
                  className="p-1 rounded text-dark-400 hover:text-primary-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Tag Input */}
              <AnimatePresence>
                {showTagInput && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mb-3 overflow-hidden"
                  >
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag(newTag)}
                        placeholder="Nova tag..."
                        className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        disabled={savingTags}
                      />
                      <button
                        onClick={() => handleAddTag(newTag)}
                        disabled={!newTag.trim() || savingTags}
                        className="px-3 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                      >
                        Adicionar
                      </button>
                    </div>
                    
                    {/* Suggested Tags */}
                    {availableSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {availableSuggestions.map(tag => (
                          <button
                            key={tag}
                            onClick={() => handleAddTag(tag)}
                            disabled={savingTags}
                            className="px-2 py-1 text-xs rounded-md bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Current Tags */}
              <div className="flex flex-wrap gap-2">
                {contact.tags && contact.tags.length > 0 ? (
                  contact.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        disabled={savingTags}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-dark-500 text-sm">Nenhuma tag</span>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-xs">Pedidos</span>
                </div>
                <p className="text-2xl font-bold text-white">{contact.total_orders || 0}</p>
              </div>
              <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs">Total Gasto</span>
                </div>
                <p className="text-2xl font-bold text-success-400">
                  {formatCurrency(contact.total_spent || 0)}
                </p>
              </div>
            </div>

            {/* Last Order */}
            {contact.last_order_at && (
              <div className="p-4 bg-dark-800/30 border border-dark-700/50 rounded-xl">
                <div className="flex items-center gap-2 text-dark-400 mb-3">
                  <Package className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Último Pedido</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">#12345</p>
                    <p className="text-success-400 text-sm">{formatCurrency(contact.average_order_value || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-dark-400 text-sm">{formatDate(contact.last_order_at)}</p>
                    <span className="inline-block px-2 py-1 text-xs rounded-md bg-amber-500/20 text-amber-400 mt-1">
                      Em separação
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Activity Timeline */}
            <div>
              <div className="flex items-center gap-2 text-dark-400 mb-4">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Atividade Recente</span>
              </div>
              <div className="space-y-1">
                {activities.map((activity, index) => {
                  const Icon = activity.icon
                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-dark-800/50 transition-colors"
                    >
                      <div className={`p-2 rounded-lg ${activity.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">{activity.title}</p>
                        <p className="text-dark-500 text-xs">{formatDate(activity.date)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-dark-700/50 space-y-2">
              <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors">
                <MessageSquare className="w-4 h-4" />
                Enviar Mensagem
              </button>
              <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-dark-800 hover:bg-dark-700 rounded-xl text-dark-300 font-medium transition-colors">
                <Mail className="w-4 h-4" />
                Enviar E-mail
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

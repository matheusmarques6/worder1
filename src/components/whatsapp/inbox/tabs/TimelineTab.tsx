'use client'

import { useState } from 'react'
import {
  Activity,
  MessageSquare,
  Phone,
  Mail,
  ShoppingCart,
  Package,
  DollarSign,
  Tag,
  User,
  CheckSquare,
  FileText,
  Bot,
  Star,
  Ban,
  Unlock,
  Megaphone,
  RefreshCw,
  Filter,
  Loader2,
  ChevronDown,
  Send,
} from 'lucide-react'
import type { InboxActivity, InboxComment } from '@/types/inbox'
import { MentionInput, MentionText } from '@/components/notifications'
import { extractMentionIds } from '@/lib/utils/mentions'

interface TimelineTabProps {
  contactId: string
  organizationId: string
  activities: InboxActivity[]
  comments: InboxComment[]
  isLoading: boolean
  onAddComment: (content: string, type?: string, mentions?: string[]) => Promise<void>
  onRefresh: () => void
}

// Helpers
const formatRelativeTime = (date?: string) => {
  if (!date) return ''
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

const getActivityConfig = (type: string) => {
  const configs: Record<string, { icon: any; color: string; bgColor: string }> = {
    // Conversas
    conversation_started: { icon: MessageSquare, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    conversation_closed: { icon: MessageSquare, color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
    message_sent: { icon: MessageSquare, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    message_received: { icon: MessageSquare, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    
    // Bot/IA
    bot_interaction: { icon: Bot, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    bot_enabled: { icon: Bot, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    bot_disabled: { icon: Bot, color: 'text-red-400', bgColor: 'bg-red-500/10' },
    
    // Agentes
    agent_assigned: { icon: User, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    agent_removed: { icon: User, color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
    
    // Tags
    tag_added: { icon: Tag, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
    tag_removed: { icon: Tag, color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
    
    // Deals
    deal_created: { icon: DollarSign, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    deal_updated: { icon: DollarSign, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
    deal_won: { icon: DollarSign, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    deal_lost: { icon: DollarSign, color: 'text-red-400', bgColor: 'bg-red-500/10' },
    deal_stage_changed: { icon: DollarSign, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    
    // Pedidos
    order_placed: { icon: ShoppingCart, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    order_fulfilled: { icon: Package, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    order_cancelled: { icon: ShoppingCart, color: 'text-red-400', bgColor: 'bg-red-500/10' },
    cart_abandoned: { icon: ShoppingCart, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
    cart_recovered: { icon: ShoppingCart, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    
    // Tarefas
    task_created: { icon: CheckSquare, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    task_completed: { icon: CheckSquare, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    task_assigned: { icon: CheckSquare, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
    
    // NFs
    invoice_uploaded: { icon: FileText, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    invoice_sent: { icon: FileText, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    
    // Contato
    contact_created: { icon: User, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    contact_updated: { icon: User, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    blocked: { icon: Ban, color: 'text-red-400', bgColor: 'bg-red-500/10' },
    unblocked: { icon: Unlock, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    
    // Campanhas
    campaign_sent: { icon: Megaphone, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    campaign_replied: { icon: Megaphone, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    campaign_clicked: { icon: Megaphone, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    
    // Notas
    note_added: { icon: FileText, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
    comment_added: { icon: MessageSquare, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
    
    // Avaliações
    rating_received: { icon: Star, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
    
    // Default
    default: { icon: Activity, color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
  }
  
  return configs[type] || configs.default
}

// Tipos de filtro
const filterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'deals', label: 'Deals' },
  { value: 'orders', label: 'Pedidos' },
  { value: 'tasks', label: 'Tarefas' },
  { value: 'messages', label: 'Mensagens' },
  { value: 'notes', label: 'Notas' },
]

export function TimelineTab({
  contactId,
  organizationId,
  activities,
  comments,
  isLoading,
  onAddComment,
  onRefresh,
}: TimelineTabProps) {
  const [filter, setFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [isAddingComment, setIsAddingComment] = useState(false)

  // Combinar activities e comments em uma timeline
  const timelineItems = [
    ...activities.map(a => ({ ...a, itemType: 'activity' as const })),
    ...comments.map(c => ({ 
      ...c, 
      itemType: 'comment' as const,
      activity_type: 'note_added',
      title: c.content.slice(0, 50) + (c.content.length > 50 ? '...' : ''),
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Filtrar itens
  const filteredItems = timelineItems.filter(item => {
    if (filter === 'all') return true
    if (filter === 'deals') return item.activity_type?.includes('deal')
    if (filter === 'orders') return item.activity_type?.includes('order') || item.activity_type?.includes('cart')
    if (filter === 'tasks') return item.activity_type?.includes('task')
    if (filter === 'messages') return item.activity_type?.includes('message') || item.activity_type?.includes('conversation')
    if (filter === 'notes') return item.itemType === 'comment' || item.activity_type?.includes('note')
    return true
  })

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    
    console.log('[Timeline] Adding comment:', { contactId, content: newComment.trim() })
    
    setIsAddingComment(true)
    try {
      // Extrair IDs dos usuários mencionados
      const mentionedUserIds = extractMentionIds(newComment)
      console.log('[Timeline] Calling onAddComment...')
      await onAddComment(newComment.trim(), 'note', mentionedUserIds)
      console.log('[Timeline] Comment added successfully!')
      setNewComment('')
      onRefresh()
    } catch (error) {
      console.error('[Timeline] Error adding comment:', error)
      alert('Erro ao adicionar nota. Verifique o console.')
    } finally {
      setIsAddingComment(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-600" />
          Timeline
          {timelineItems.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-100 rounded-md">
              {timelineItems.length}
            </span>
          )}
        </h4>
        
        <div className="flex items-center gap-2">
          {/* Filtro */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-100 rounded-lg transition-colors
                         flex items-center gap-1"
            >
              <Filter className="w-4 h-4" />
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showFilters && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-gray-100 rounded-lg shadow-lg 
                              border border-gray-300 py-1 z-10">
                {filterOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setFilter(option.value)
                      setShowFilters(false)
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                      filter === option.value 
                        ? 'text-brand-600 bg-brand-50' 
                        : 'text-gray-600 hover:text-white hover:bg-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Adicionar comentário com menções */}
      <div className="flex gap-2">
        <div className="flex-1">
          <MentionInput
            value={newComment}
            onChange={setNewComment}
            onSubmit={handleAddComment}
            placeholder="Adicionar nota... Use @ para mencionar"
            organizationId={organizationId}
            disabled={isAddingComment}
            rows={1}
            className="bg-white border-gray-200 text-white placeholder:text-gray-400 
                       focus:border-primary-500 focus:ring-primary-500/20"
          />
        </div>
        <button
          onClick={handleAddComment}
          disabled={!newComment.trim() || isAddingComment}
          className="px-3 py-2 bg-primary-500 text-white rounded-lg 
                     hover:bg-primary-600 transition-colors disabled:opacity-50
                     flex items-center gap-1 h-fit"
        >
          {isAddingComment ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Timeline */}
      {filteredItems.length > 0 ? (
        <div className="relative">
          {/* Linha vertical */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-100" />
          
          <div className="space-y-3">
            {filteredItems.map((item, index) => (
              <TimelineItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 
                          flex items-center justify-center">
            <Activity className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">
            {filter === 'all' ? 'Nenhuma atividade' : `Nenhum item de ${filterOptions.find(f => f.value === filter)?.label}`}
          </p>
        </div>
      )}
    </div>
  )
}

// Timeline Item Component
function TimelineItem({ item }: { item: any }) {
  const config = getActivityConfig(item.activity_type)
  const Icon = config.icon

  return (
    <div className="relative flex gap-3 pl-1">
      {/* Ícone */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 
                       ${config.bgColor} z-10`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 pb-3">
        <div className="p-3 bg-gray-50 rounded-xl">
          <p className="text-sm text-white">
            {item.title}
          </p>
          
          {item.description && item.itemType !== 'comment' && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {item.description}
            </p>
          )}
          
          {item.itemType === 'comment' && (
            <MentionText 
              text={item.content} 
              className="text-xs text-gray-600 mt-1 block" 
            />
          )}
          
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <span>{formatRelativeTime(item.created_at)}</span>
            {item.created_by_name && (
              <>
                <span>•</span>
                <span>{item.created_by_name}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TimelineTab

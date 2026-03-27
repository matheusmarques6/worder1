'use client'

import { motion } from 'framer-motion'
import { 
  Bot, 
  MessageSquare, 
  Loader2,
  User,
} from 'lucide-react'
import type { InboxConversation } from '@/types/inbox'

interface ConversationListProps {
  conversations: InboxConversation[]
  selectedId?: string
  isLoading: boolean
  onSelect: (conversation: InboxConversation) => void
}

// Helpers
const formatPhone = (phone?: string) => {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  return phone
}

const formatTime = (date?: string) => {
  if (!date) return ''
  const now = new Date()
  const dt = new Date(date)
  const diffMinutes = Math.floor((now.getTime() - dt.getTime()) / 60000)
  
  if (diffMinutes < 1) return 'Agora'
  if (diffMinutes < 60) return `${diffMinutes}min`
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`
  if (diffMinutes < 2880) return 'Ontem'
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const getInitials = (name?: string) => {
  if (!name) return '??'
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Conversation Item
function ConversationItem({ 
  conversation, 
  isSelected, 
  onClick 
}: { 
  conversation: InboxConversation
  isSelected: boolean
  onClick: () => void 
}) {
  const name = conversation.contact_name || formatPhone(conversation.phone_number)
  const hasUnread = conversation.unread_count > 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onClick}
      className={`
        flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 transition-all
        ${isSelected
          ? 'bg-orange-50 border-l-2 border-l-orange-500'
          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
        }
      `}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {conversation.contact_avatar ? (
          <img
            src={conversation.contact_avatar}
            alt={name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
            <span className="text-orange-700 font-medium text-sm">
              {getInitials(conversation.contact_name || conversation.phone_number)}
            </span>
          </div>
        )}

        {/* Bot indicator */}
        {conversation.is_bot_active && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-500 rounded-full
                          flex items-center justify-center border-2 border-white">
            <Bot className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <span className={`text-sm font-medium truncate ${hasUnread ? 'text-gray-900' : 'text-gray-900'}`}>
            {name}
          </span>
          <span className={`text-xs flex-shrink-0 ${
            hasUnread ? 'text-orange-500 font-medium' : 'text-gray-400'
          }`}>
            {formatTime(conversation.last_message_at)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs truncate ${hasUnread ? 'text-gray-600' : 'text-gray-500'}`}>
            {conversation.last_message_preview || 'Nova conversa'}
          </p>

          {hasUnread && (
            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-orange-500" />
          )}
        </div>

        {/* Tags preview */}
        {conversation.contact_tags && conversation.contact_tags.length > 0 && (
          <div className="flex gap-1 mt-1.5 overflow-hidden">
            {conversation.contact_tags.slice(0, 2).map((tag, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-500 truncate max-w-[80px]"
              >
                {tag}
              </span>
            ))}
            {conversation.contact_tags.length > 2 && (
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-400">
                +{conversation.contact_tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Priority badge */}
        {conversation.priority && conversation.priority !== 'normal' && (
          <div className="mt-1.5">
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
              conversation.priority === 'urgent' ? 'bg-red-100 text-red-600' :
              conversation.priority === 'high' ? 'bg-amber-100 text-amber-600' :
              'bg-gray-100 text-gray-500'
            }`}>
              {conversation.priority === 'urgent' ? 'Urgente' :
               conversation.priority === 'high' ? 'Alta' : 'Baixa'}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// Main Component
export function ConversationList({ 
  conversations, 
  selectedId, 
  isLoading, 
  onSelect 
}: ConversationListProps) {
  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm font-medium text-gray-500">Nenhuma conversa</p>
        <p className="text-xs text-gray-400 mt-1 text-center">
          Aguardando novas mensagens ou inicie uma nova conversa
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          isSelected={selectedId === conversation.id}
          onClick={() => onSelect(conversation)}
        />
      ))}
    </div>
  )
}

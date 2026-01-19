export type NotificationType =
  | 'mention' | 'task_assigned' | 'task_due_soon' | 'task_overdue'
  | 'task_completed' | 'comment_reply' | 'deal_assigned'
  | 'deal_stage_changed' | 'whatsapp_mention' | 'reminder'

export type ReferenceType = 'contact' | 'task' | 'deal' | 'comment' | 'conversation'

export interface NotificationActor {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
}

export interface Notification {
  id: string
  organization_id: string
  user_id: string
  type: NotificationType
  title: string
  message: string | null
  reference_type: ReferenceType | null
  reference_id: string | null
  actor_id: string | null
  actor?: NotificationActor | null
  read: boolean
  read_at: string | null
  dismissed: boolean
  dismissed_at: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface NotificationPreferences {
  id: string
  user_id: string
  organization_id: string
  mention_enabled: boolean
  task_assigned_enabled: boolean
  task_due_soon_enabled: boolean
  task_overdue_enabled: boolean
  task_completed_enabled: boolean
  comment_reply_enabled: boolean
  deal_assigned_enabled: boolean
  deal_stage_changed_enabled: boolean
  whatsapp_mention_enabled: boolean
  reminder_enabled: boolean
  in_app_enabled: boolean
  email_enabled: boolean
  push_enabled: boolean
  dnd_enabled: boolean
  dnd_start: string | null
  dnd_end: string | null
  created_at: string
  updated_at: string
}

export interface NotificationsResponse {
  notifications: Notification[]
  total: number
  unread_count: number
  limit: number
  offset: number
}

export interface MentionableUser {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
  role?: string
}

export function extractMentions(text: string) {
  const regex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g
  const mentions: Array<{ fullMatch: string; name: string; userId: string; startIndex: number; endIndex: number }> = []
  let match
  while ((match = regex.exec(text)) !== null) {
    mentions.push({ fullMatch: match[0], name: match[1], userId: match[2], startIndex: match.index, endIndex: match.index + match[0].length })
  }
  return mentions
}

export function formatMention(userId: string, name: string): string {
  return `@[${name}](${userId})`
}

export const NOTIFICATION_CONFIG: Record<NotificationType, { icon: string; color: string; label: string; description: string }> = {
  mention: { icon: 'AtSign', color: 'blue', label: 'Menções', description: 'Quando alguém mencionar você' },
  task_assigned: { icon: 'UserPlus', color: 'purple', label: 'Tarefa atribuída', description: 'Quando uma tarefa for atribuída a você' },
  task_due_soon: { icon: 'Clock', color: 'yellow', label: 'Tarefa vencendo', description: 'Tarefa prestes a vencer (24h)' },
  task_overdue: { icon: 'AlertTriangle', color: 'red', label: 'Tarefa atrasada', description: 'Quando uma tarefa estiver atrasada' },
  task_completed: { icon: 'CheckCircle', color: 'green', label: 'Tarefa concluída', description: 'Quando uma tarefa que você criou for concluída' },
  comment_reply: { icon: 'MessageCircle', color: 'blue', label: 'Resposta', description: 'Quando alguém responder seu comentário' },
  deal_assigned: { icon: 'Briefcase', color: 'purple', label: 'Deal atribuído', description: 'Quando um deal for atribuído a você' },
  deal_stage_changed: { icon: 'ArrowRight', color: 'orange', label: 'Deal movido', description: 'Quando um deal seu mudar de estágio' },
  whatsapp_mention: { icon: 'MessageSquare', color: 'green', label: 'Menção WhatsApp', description: 'Mencionado em conversa WhatsApp' },
  reminder: { icon: 'Bell', color: 'gray', label: 'Lembretes', description: 'Lembretes personalizados' }
}

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, CheckCheck, X, Settings, AtSign, UserPlus, Clock, AlertTriangle, CheckCircle, MessageCircle, Briefcase, ArrowRight, MessageSquare, Loader2 } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Notification, NotificationType } from '@/types/notifications'

interface NotificationPanelProps { organizationId: string; onClose?: () => void }

const ICONS: Record<NotificationType, React.ElementType> = { mention: AtSign, task_assigned: UserPlus, task_due_soon: Clock, task_overdue: AlertTriangle, task_completed: CheckCircle, comment_reply: MessageCircle, deal_assigned: Briefcase, deal_stage_changed: ArrowRight, whatsapp_mention: MessageSquare, reminder: Bell }
const COLORS: Record<NotificationType, string> = { mention: 'text-blue-500 bg-blue-50', task_assigned: 'text-purple-500 bg-purple-50', task_due_soon: 'text-yellow-600 bg-yellow-50', task_overdue: 'text-red-500 bg-red-50', task_completed: 'text-green-500 bg-green-50', comment_reply: 'text-blue-500 bg-blue-50', deal_assigned: 'text-purple-500 bg-purple-50', deal_stage_changed: 'text-orange-500 bg-orange-50', whatsapp_mention: 'text-green-500 bg-green-50', reminder: 'text-gray-500 bg-gray-50' }

export function NotificationPanel({ organizationId, onClose }: NotificationPanelProps) {
  const router = useRouter()
  const { notifications, unreadCount, isLoading, hasMore, markAsRead, markAllAsRead, dismiss, loadMore, refresh } = useNotifications({ organizationId })
  
  useEffect(() => { refresh() }, [])
  
  const handleClick = async (n: Notification) => {
    if (!n.read) await markAsRead(n.id)
    if (n.reference_type && n.reference_id) {
      const routes: Record<string, string> = { contact: `/whatsapp/inbox?contact=${n.reference_id}`, task: `/tasks?task=${n.reference_id}`, deal: `/crm/deals?deal=${n.reference_id}`, conversation: `/whatsapp/inbox?conversation=${n.reference_id}` }
      if (routes[n.reference_type]) { router.push(routes[n.reference_type]); onClose?.() }
    }
  }
  
  return (
    <div className="w-96 max-h-[80vh] flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Notificações</h3>
          {unreadCount > 0 && <span className="px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-100 rounded-full">{unreadCount} nova{unreadCount !== 1 ? 's' : ''}</span>}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && <button onClick={markAllAsRead} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Marcar todas como lidas"><CheckCheck className="w-4 h-4" /></button>}
          <button onClick={() => { router.push('/settings/notifications'); onClose?.() }} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Configurações"><Settings className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && notifications.length === 0 ? <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        : notifications.length === 0 ? <div className="flex flex-col items-center justify-center py-12 px-4 text-center"><div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3"><Bell className="w-6 h-6 text-gray-400" /></div><p className="text-gray-500 text-sm">Nenhuma notificação</p></div>
        : <>
          {notifications.map((n) => { const Icon = ICONS[n.type]; return (
            <div key={n.id} onClick={() => handleClick(n)} className={cn('relative flex gap-3 p-4 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0', !n.read && 'bg-blue-50/50 dark:bg-blue-900/10')}>
              {!n.read && <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />}
              <div className={cn('flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center', COLORS[n.type])}><Icon className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm', !n.read ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300')}>{n.title}</p>
                {n.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>}
                <p className="text-xs text-gray-400 mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</p>
              </div>
              <div className="flex-shrink-0 flex items-start gap-1">
                {!n.read && <button onClick={(e) => { e.stopPropagation(); markAsRead(n.id) }} className="p-1 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded" title="Marcar como lida"><Check className="w-4 h-4" /></button>}
                <button onClick={(e) => { e.stopPropagation(); dismiss(n.id) }} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Dispensar"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )})}
          {hasMore && <button onClick={loadMore} disabled={isLoading} className="w-full py-3 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50">{isLoading ? 'Carregando...' : 'Carregar mais'}</button>}
        </>}
      </div>
    </div>
  )
}

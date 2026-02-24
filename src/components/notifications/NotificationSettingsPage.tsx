'use client'

import { useEffect, useState } from 'react'
import { Bell, AtSign, UserPlus, Clock, AlertTriangle, CheckCircle, MessageCircle, Briefcase, ArrowRight, MessageSquare, Moon, Loader2, Save } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import { NOTIFICATION_CONFIG, type NotificationType } from '@/types/notifications'

const TYPE_ICONS: Record<NotificationType, React.ElementType> = { mention: AtSign, task_assigned: UserPlus, task_due_soon: Clock, task_overdue: AlertTriangle, task_completed: CheckCircle, comment_reply: MessageCircle, deal_assigned: Briefcase, deal_stage_changed: ArrowRight, whatsapp_mention: MessageSquare, reminder: Bell }

function ToggleItem({ icon: Icon, label, description, checked, onChange, disabled }: { icon: React.ElementType; label: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0', disabled && 'opacity-50')}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" /></div>
        <div><p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p><p className="text-xs text-gray-500">{description}</p></div>
      </div>
      <label className={cn('relative inline-flex items-center', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full transition-colors peer-disabled:opacity-50" />
      </label>
    </div>
  )
}

export function NotificationSettingsPage({ organizationId, userId }: { organizationId: string; userId: string }) {
  const { preferences, fetchPreferences, updatePreferences } = useNotifications({ organizationId, userId, autoFetch: false })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [localPrefs, setLocalPrefs] = useState<Record<string, any>>({})
  const [hasChanges, setHasChanges] = useState(false)
  
  useEffect(() => { setIsLoading(true); fetchPreferences().finally(() => setIsLoading(false)) }, [fetchPreferences])
  useEffect(() => { if (preferences) setLocalPrefs(preferences) }, [preferences])
  useEffect(() => { if (preferences) setHasChanges(Object.keys(localPrefs).some(k => localPrefs[k] !== (preferences as any)[k])) }, [localPrefs, preferences])
  
  const updateLocal = (key: string, value: any) => setLocalPrefs(prev => ({ ...prev, [key]: value }))
  const handleSave = async () => { setIsSaving(true); try { await updatePreferences(localPrefs); setHasChanges(false) } finally { setIsSaving(false) } }
  
  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 text-gray-400 animate-spin" /></div>
  
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configurações de Notificações</h1><p className="text-gray-500 mt-1">Personalize como e quando você recebe notificações</p></div>
        {hasChanges && <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Salvar</button>}
      </div>
      
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Canais de Notificação</h2>
        <div className="space-y-4">
          <ToggleItem icon={Bell} label="Notificações no App" description="Receba notificações dentro do Worder" checked={localPrefs.in_app_enabled ?? true} onChange={(v) => updateLocal('in_app_enabled', v)} />
        </div>
      </section>
      
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tipos de Notificação</h2>
        <div className="space-y-4">
          {(Object.keys(NOTIFICATION_CONFIG) as NotificationType[]).map((type) => (
            <ToggleItem key={type} icon={TYPE_ICONS[type]} label={NOTIFICATION_CONFIG[type].label} description={NOTIFICATION_CONFIG[type].description} checked={localPrefs[`${type}_enabled`] ?? true} onChange={(v) => updateLocal(`${type}_enabled`, v)} />
          ))}
        </div>
      </section>
      
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Não Perturbe</h2><p className="text-sm text-gray-500 mt-1">Silencie notificações durante um período</p></div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={localPrefs.dnd_enabled ?? false} onChange={(e) => updateLocal('dnd_enabled', e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full transition-colors" />
          </label>
        </div>
        {localPrefs.dnd_enabled && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Moon className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">De</span>
            <input type="time" value={localPrefs.dnd_start || '22:00'} onChange={(e) => updateLocal('dnd_start', e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
            <span className="text-sm text-gray-600">até</span>
            <input type="time" value={localPrefs.dnd_end || '08:00'} onChange={(e) => updateLocal('dnd_end', e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
          </div>
        )}
      </section>
    </div>
  )
}

export default NotificationSettingsPage

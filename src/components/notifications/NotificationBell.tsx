'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useUnreadCount } from '@/hooks/useNotifications'
import { NotificationPanel } from './NotificationPanel'
import { cn } from '@/lib/utils'

interface NotificationBellProps {
  organizationId: string
  className?: string
}

export function NotificationBell({ organizationId, className }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const unreadCount = useUnreadCount(organizationId)
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])
  
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) { if (event.key === 'Escape') setIsOpen(false) }
    if (isOpen) document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])
  
  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn('relative p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500', isOpen && 'bg-gray-100 dark:bg-gray-800')}
        aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        {unreadCount > 0 && (
          <>
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
            <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-red-500 rounded-full animate-ping opacity-75" />
          </>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50">
          <NotificationPanel organizationId={organizationId} onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  )
}

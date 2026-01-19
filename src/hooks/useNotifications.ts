'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseClient } from '@/lib/supabase-client'
import type { Notification, NotificationsResponse, NotificationPreferences } from '@/types/notifications'

interface UseNotificationsOptions {
  organizationId: string | null
  userId: string | null
  autoFetch?: boolean
  pollInterval?: number
  limit?: number
}

export function useNotifications(options: UseNotificationsOptions) {
  const { organizationId, userId, autoFetch = true, pollInterval = 30000, limit = 20 } = options
  
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const fetchNotifications = useCallback(async (reset: boolean = true) => {
    if (!organizationId || !userId) return
    setIsLoading(true)
    setError(null)
    try {
      const currentOffset = reset ? 0 : offset
      const response = await fetch(`/api/notifications?organization_id=${organizationId}&user_id=${userId}&limit=${limit}&offset=${currentOffset}`)
      if (!response.ok) throw new Error('Erro ao buscar notificações')
      const data: NotificationsResponse = await response.json()
      if (reset) { setNotifications(data.notifications); setOffset(limit) }
      else { setNotifications(prev => [...prev, ...data.notifications]); setOffset(prev => prev + limit) }
      setUnreadCount(data.unread_count)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, userId, limit, offset])
  
  const loadMore = useCallback(async () => {
    if (isLoading || notifications.length >= total) return
    await fetchNotifications(false)
  }, [fetchNotifications, isLoading, notifications.length, total])
  
  const markAsRead = useCallback(async (notificationId: string) => {
    const response = await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: notificationId, action: 'read' })
    })
    if (!response.ok) throw new Error('Erro ao marcar como lida')
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])
  
  const markAllAsRead = useCallback(async () => {
    if (!organizationId || !userId) return
    const response = await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId, user_id: userId, action: 'mark_all_read' })
    })
    if (!response.ok) throw new Error('Erro')
    setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() })))
    setUnreadCount(0)
  }, [organizationId, userId])
  
  const dismiss = useCallback(async (notificationId: string) => {
    const response = await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: notificationId, action: 'dismiss' })
    })
    if (!response.ok) throw new Error('Erro')
    const notification = notifications.find(n => n.id === notificationId)
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    setTotal(prev => prev - 1)
    if (notification && !notification.read) setUnreadCount(prev => Math.max(0, prev - 1))
  }, [notifications])
  
  const refresh = useCallback(async () => { await fetchNotifications(true) }, [fetchNotifications])
  
  const fetchPreferences = useCallback(async () => {
    if (!organizationId || !userId) return
    const response = await fetch(`/api/notifications/preferences?organization_id=${organizationId}&user_id=${userId}`)
    if (response.ok) { const data = await response.json(); setPreferences(data.preferences) }
  }, [organizationId, userId])
  
  const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
    if (!organizationId || !userId) return
    const response = await fetch('/api/notifications/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId, user_id: userId, ...updates })
    })
    if (response.ok) { const data = await response.json(); setPreferences(data.preferences) }
  }, [organizationId, userId])
  
  useEffect(() => { if (autoFetch && organizationId && userId) fetchNotifications(true) }, [autoFetch, organizationId, userId])
  
  useEffect(() => {
    if (!organizationId || !userId || pollInterval <= 0) return
    pollIntervalRef.current = setInterval(() => {
      fetch(`/api/notifications?organization_id=${organizationId}&user_id=${userId}&limit=1`)
        .then(res => res.json())
        .then(data => { if (data.unread_count !== unreadCount) { setUnreadCount(data.unread_count); if (data.unread_count > unreadCount) fetchNotifications(true) } })
        .catch(console.error)
    }, pollInterval)
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [organizationId, userId, pollInterval, unreadCount])
  
  useEffect(() => {
    if (!organizationId) return
    const channel = supabaseClient
      .channel(`notifications:${organizationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `organization_id=eq.${organizationId}` }, () => fetchNotifications(true))
      .subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [organizationId])
  
  return { notifications, unreadCount, total, isLoading, error, hasMore: notifications.length < total, preferences, fetchNotifications, loadMore, markAsRead, markAllAsRead, dismiss, refresh, fetchPreferences, updatePreferences }
}

export function useUnreadCount(organizationId: string | null, userId: string | null) {
  const [count, setCount] = useState(0)
  
  useEffect(() => {
    if (!organizationId || !userId) return
    fetch(`/api/notifications?organization_id=${organizationId}&user_id=${userId}&limit=1`).then(res => res.json()).then(data => setCount(data.unread_count || 0)).catch(console.error)
    const channel = supabaseClient
      .channel(`unread:${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `organization_id=eq.${organizationId}` }, () => {
        fetch(`/api/notifications?organization_id=${organizationId}&user_id=${userId}&limit=1`).then(res => res.json()).then(data => setCount(data.unread_count || 0)).catch(console.error)
      }).subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [organizationId, userId])
  
  return count
}

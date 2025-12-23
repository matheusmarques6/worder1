'use client';

// =============================================
// Componente: Sininho de Notificações
// src/components/notifications/NotificationBell.tsx
// =============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  AlertCircle, 
  AlertTriangle,
  Info,
  ShoppingBag,
  MessageCircle,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { useAuthStore } from '@/stores';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface NotificationData {
  integration_type?: string;
}

interface Notification {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  data: NotificationData;
  action_url?: string;
  action_label?: string;
  read: boolean;
  read_at?: string;
  created_at: string;
}

const POLLING_INTERVAL = 30000;
const MAX_NOTIFICATIONS = 15;

export default function NotificationBell() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.organization_id) return;
    
    try {
      const res = await fetch(
        `/api/notifications?organizationId=${user.organization_id}&limit=${MAX_NOTIFICATIONS}`
      );
      
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (user?.organization_id) {
      loadNotifications();
      const interval = setInterval(loadNotifications, POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [user?.organization_id, loadNotifications]);

  const markAsRead = async (ids: string[]) => {
    if (!user?.organization_id || ids.length === 0) return;
    
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: user.organization_id,
          notificationIds: ids,
        }),
      });
      
      setNotifications(prev => 
        prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - ids.length));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.organization_id) return;
    
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: user.organization_id,
          markAllRead: true,
        }),
      });
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const getIcon = (notification: Notification) => {
    const type = notification.data?.integration_type;
    
    if (type === 'shopify') {
      return <ShoppingBag className="w-4 h-4 text-[#95BF47]" />;
    }
    if (type === 'whatsapp') {
      return <MessageCircle className="w-4 h-4 text-[#25D366]" />;
    }
    
    switch (notification.priority) {
      case 'urgent':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getBorderColor = (priority: string) => {
    const colors: Record<string, string> = {
      urgent: 'border-l-red-500',
      high: 'border-l-amber-500',
      normal: 'border-l-blue-500',
    };
    return colors[priority] ?? 'border-l-dark-600';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-xl transition-colors"
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between bg-dark-800/80 backdrop-blur">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-400" />
              <h3 className="font-semibold text-white">Notificações</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6 text-dark-500" />
                </div>
                <p className="text-dark-400 font-medium">Nenhuma notificação</p>
                <p className="text-dark-500 text-sm mt-1">
                  Você será notificado sobre eventos importantes
                </p>
              </div>
            ) : (
              <div className="divide-y divide-dark-700">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-dark-700/50 transition-colors border-l-4 ${getBorderColor(notification.priority)} ${
                      !notification.read ? 'bg-dark-700/30' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getIcon(notification)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`text-sm font-medium line-clamp-1 ${
                            notification.read ? 'text-dark-300' : 'text-white'
                          }`}>
                            {notification.title}
                          </h4>
                          
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!notification.read && (
                              <button
                                onClick={() => markAsRead([notification.id])}
                                className="p-1 text-dark-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                title="Marcar como lida"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notification.id)}
                              className="p-1 text-dark-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        
                        <p className="text-sm text-dark-400 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-dark-500">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                          
                          {notification.action_url && (
                            <a
                              href={notification.action_url}
                              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
                              onClick={() => {
                                markAsRead([notification.id]);
                                setIsOpen(false);
                              }}
                            >
                              {notification.action_label ?? 'Ver mais'}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-dark-700 bg-dark-800/80">
              <a
                href="/notifications"
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center justify-center gap-1 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Ver todas as notificações
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

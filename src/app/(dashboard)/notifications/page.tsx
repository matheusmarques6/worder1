'use client';

import { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  action_url?: string;
}

export default function NotificationsPage() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_notifs() {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || data || []);
        }
      } catch {}
      setLoading(false);
    }
    fetch_notifs();
  }, []);

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notificações</h1>
          <p className="text-sm text-gray-500 mt-1">Acompanhe as atividades da sua organização</p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Marcar todas como lidas
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma notificação</h3>
          <p className="text-sm text-gray-500">Você está em dia! Novas notificações aparecerão aqui.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`px-6 py-4 flex items-start gap-4 ${!notification.read ? 'bg-orange-50/50' : 'hover:bg-gray-50'}`}
            >
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!notification.read ? 'bg-orange-500' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{notification.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {notification.created_at ? new Date(notification.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  }) : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

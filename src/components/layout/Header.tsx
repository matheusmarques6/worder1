'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Bell,
  Settings,
  User,
  LogOut,
  HelpCircle,
  Moon,
  Sun,
  ChevronDown,
  Command,
  Sparkles,
  ExternalLink,
  CreditCard,
  Building2,
  Check,
  CheckCheck,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  ShoppingBag,
  MessageCircle,
  Loader2,
  Users,
} from 'lucide-react';
import { Button, Input, Badge, Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useUIStore, useAuthStore } from '@/stores';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ============================================
// Types
// ============================================

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

// ============================================
// Search Command Palette
// ============================================

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  const suggestions = [
    { type: 'page', label: 'Dashboard', icon: Sparkles, href: '/dashboard' },
    { type: 'page', label: 'CRM', icon: Building2, href: '/crm' },
    { type: 'page', label: 'WhatsApp', icon: Command, href: '/whatsapp' },
    { type: 'page', label: 'Automações', icon: Sparkles, href: '/automations' },
    { type: 'action', label: 'Criar nova automação', icon: Sparkles },
    { type: 'action', label: 'Adicionar contato', icon: User },
  ];

  const filteredSuggestions = suggestions.filter((s) =>
    s.label.toLowerCase().includes(query.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Palette */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50"
      >
        <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <Search className="w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar páginas, ações, contatos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder:text-gray-500 outline-none text-sm"
              autoFocus
            />
            <kbd className="px-2 py-1 text-xs bg-gray-100 rounded text-gray-500">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {filteredSuggestions.length > 0 ? (
              filteredSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={onClose}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="p-1.5 rounded-lg bg-gray-100">
                    <suggestion.icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <span className="text-sm text-gray-700">{suggestion.label}</span>
                  <span className="ml-auto text-xs text-gray-400 capitalize">
                    {suggestion.type === 'page' ? 'Página' : 'Ação'}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500">
                  Nenhum resultado encontrado
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↵</kbd>
              selecionar
            </span>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ============================================
// Notifications Dropdown (INTEGRADO COM BACKEND)
// ============================================

interface NotificationsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  onMarkAsRead: (ids: string[]) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
}

function NotificationsDropdown({ 
  isOpen, 
  onClose,
  notifications,
  unreadCount,
  loading,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
}: NotificationsDropdownProps) {
  
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

  const getTypeColor = (notification: Notification) => {
    const priority = notification.priority;
    switch (priority) {
      case 'urgent':
        return 'bg-red-500';
      case 'high':
        return 'bg-amber-500';
      case 'normal':
        return 'bg-blue-500';
      default:
        return 'bg-slate-500';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Notificações</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
                {unreadCount} nova{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button 
              onClick={onMarkAllAsRead}
              className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar todas
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">Nenhuma notificação</p>
              <p className="text-xs text-gray-400 mt-1">
                Você será notificado sobre eventos importantes
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors',
                  !notification.read && 'bg-primary/5'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {getIcon(notification)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-sm font-medium line-clamp-1",
                        notification.read ? 'text-gray-600' : 'text-white'
                      )}>
                        {notification.title}
                      </p>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notification.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkAsRead([notification.id]);
                            }}
                            className="p-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                            title="Marcar como lida"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(notification.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                      
                      {notification.action_url && (
                        <a
                          href={notification.action_url}
                          onClick={() => {
                            onMarkAsRead([notification.id]);
                            onClose();
                          }}
                          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                        >
                          {notification.action_label ?? 'Ver mais'}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <a 
              href="/notifications"
              onClick={onClose}
              className="w-full text-center text-sm text-primary hover:text-primary/80 transition-colors flex items-center justify-center gap-1"
            >
              Ver todas as notificações
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </motion.div>
    </>
  );
}

// ============================================
// User Menu Dropdown
// ============================================

interface AgentStatus {
  id: string;
  name: string;
  avatar_url?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  last_seen_at?: string;
}

interface UserMenuDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    name: string;
    email: string;
    avatar?: string;
    plan: string;
    role?: string;
  };
}

function UserMenuDropdown({ isOpen, onClose, user }: UserMenuDropdownProps) {
  const router = useRouter();
  const { theme, setTheme } = useUIStore();
  const { signOut, user: authUser } = useAuthStore();
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Carregar agentes quando menu abre
  useEffect(() => {
    if (isOpen && authUser?.organization_id) {
      fetchAgents();
    }
  }, [isOpen, authUser?.organization_id]);

  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch('/api/agents/status');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      signOut();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleNavigation = (path: string) => {
    onClose();
    router.push(path);
  };

  // Obter label do cargo
  const getRoleLabel = () => {
    const role = authUser?.role || user.role;
    switch (role) {
      case 'admin': return 'Administrador';
      case 'manager': return 'Gerente';
      case 'agent': return 'Agente';
      default: return 'Admin';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
      >
        {/* User Info */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Avatar 
              fallback={user.name?.substring(0, 2) || 'U'} 
              src={user.avatar} 
              size="lg" 
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-brand-100 text-brand-600">
                {getRoleLabel()}
              </span>
            </div>
          </div>
        </div>

        {/* Agents Section */}
        {agents.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-200">
            <div className="flex items-center gap-2 px-1 mb-2">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Agentes ({agents.filter(a => a.status === 'online').length} online)
              </span>
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {loadingAgents ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              ) : (
                agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                  >
                    <div className="relative">
                      {agent.avatar_url ? (
                        <img 
                          src={agent.avatar_url} 
                          alt={agent.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-[10px] text-gray-500">
                            {agent.name?.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-200',
                        agent.status === 'online' && 'bg-green-500',
                        agent.status === 'away' && 'bg-yellow-500',
                        agent.status === 'busy' && 'bg-red-500',
                        agent.status === 'offline' && 'bg-gray-300',
                      )} />
                    </div>
                    <span className="text-xs text-gray-600 truncate flex-1">{agent.name}</span>
                    <span className={cn(
                      'text-[10px]',
                      agent.status === 'online' && 'text-green-400',
                      agent.status === 'away' && 'text-yellow-400',
                      agent.status === 'busy' && 'text-red-400',
                      agent.status === 'offline' && 'text-gray-400',
                    )}>
                      {agent.status === 'online' ? 'Online' : 
                       agent.status === 'away' ? 'Ausente' :
                       agent.status === 'busy' ? 'Ocupado' : 'Offline'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Menu Items */}
        <div className="py-2">
          <button 
            onClick={() => handleNavigation('/settings?tab=profile')}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 transition-colors"
          >
            <User className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Meu Perfil</span>
          </button>
          <button 
            onClick={() => handleNavigation('/settings?tab=store')}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 transition-colors"
          >
            <Building2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Configurações da Loja</span>
          </button>
          <button 
            onClick={() => handleNavigation('/settings?tab=billing')}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 transition-colors"
          >
            <CreditCard className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Faturamento</span>
          </button>
          <button 
            onClick={() => handleNavigation('/settings?tab=integrations')}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Integrações</span>
          </button>
        </div>

        {/* Theme Toggle */}
        <div className="px-4 py-2 border-t border-gray-200">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-gray-500" />
              ) : (
                <Sun className="w-4 h-4 text-gray-500" />
              )}
              <span className="text-sm text-gray-600">
                {theme === 'dark' ? 'Modo Escuro' : 'Modo Claro'}
              </span>
            </div>
            <div className="w-8 h-5 rounded-full bg-brand-100 relative">
              <div
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-primary-500 transition-all',
                  theme === 'dark' ? 'left-0.5' : 'left-3.5'
                )}
              />
            </div>
          </button>
        </div>

        {/* Logout */}
        <div className="px-4 py-2 border-t border-gray-200">
          <button 
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-red-400 disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ============================================
// Main Header Component
// ============================================

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const POLLING_INTERVAL = 30000; // 30 segundos

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { user } = useAuthStore();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // User data (fallback se não tiver user logado)
  const userData = {
    name: user?.name || user?.email?.split('@')[0] || 'Usuário',
    email: user?.email || 'usuario@email.com',
    avatar: user?.avatar_url || undefined,
    plan: 'Pro',
    role: user?.role || 'admin',
  };

  // ============================================
  // Carregar notificações do backend
  // ============================================
  const loadNotifications = useCallback(async () => {
    if (!user?.organization_id) return;
    
    try {
      const res = await fetch(
        `/api/notifications?limit=15`
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

  // Carregar notificações inicial + polling
  useEffect(() => {
    if (user?.organization_id) {
      setLoadingNotifications(true);
      loadNotifications().finally(() => setLoadingNotifications(false));
      
      const interval = setInterval(loadNotifications, POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [user?.organization_id, loadNotifications]);

  // ============================================
  // Ações de notificações
  // ============================================
  const markAsRead = async (ids: string[]) => {
    if (!user?.organization_id || ids.length === 0) return;
    
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      setNotifications(prev => {
        const notification = prev.find(n => n.id === id);
        if (notification && !notification.read) {
          setUnreadCount(c => Math.max(0, c - 1));
        }
        return prev.filter(n => n.id !== id);
      });
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(true);
      }
      if (e.key === 'Escape') {
        setIsCommandOpen(false);
        setIsNotificationsOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="h-16 border-b border-gray-100 bg-white backdrop-blur-sm sticky top-0 z-30">
        <div className="h-full px-6 flex items-center justify-between gap-4">
          {/* Left: Title or Search */}
          <div className="flex items-center gap-4 flex-1">
            {title ? (
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-gray-500">{subtitle}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsCommandOpen(true)}
                className="flex items-center gap-3 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl transition-colors w-full max-w-md"
              >
                <Search className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-500 flex-1 text-left">
                  Buscar...
                </span>
                <kbd className="px-2 py-0.5 text-xs bg-gray-200 rounded text-gray-500">
                  ⌘K
                </kbd>
              </button>
            )}
          </div>

          {/* Center: Custom Actions */}
          {actions && <div className="flex items-center gap-2">{actions}</div>}

          {/* Right: Notifications & User */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setIsUserMenuOpen(false);
                }}
                className="relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 rounded-full text-[10px] font-medium text-white flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
              <AnimatePresence>
                <NotificationsDropdown
                  isOpen={isNotificationsOpen}
                  onClose={() => setIsNotificationsOpen(false)}
                  notifications={notifications}
                  unreadCount={unreadCount}
                  loading={loadingNotifications}
                  onMarkAsRead={markAsRead}
                  onMarkAllAsRead={markAllAsRead}
                  onDelete={deleteNotification}
                />
              </AnimatePresence>
            </div>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsUserMenuOpen(!isUserMenuOpen);
                  setIsNotificationsOpen(false);
                }}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Avatar 
                  fallback={userData.name?.substring(0, 2) || 'U'} 
                  src={userData.avatar}
                  size="sm" 
                />
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-medium text-white truncate max-w-[100px]">
                    {userData.name}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {userData.role === 'admin' ? 'admin' : userData.role}
                  </p>
                </div>
                <ChevronDown className={cn(
                  "w-4 h-4 text-gray-500 transition-transform",
                  isUserMenuOpen && "rotate-180"
                )} />
              </button>
              <AnimatePresence>
                <UserMenuDropdown
                  isOpen={isUserMenuOpen}
                  onClose={() => setIsUserMenuOpen(false)}
                  user={userData}
                />
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Command Palette */}
      <AnimatePresence>
        <CommandPalette
          isOpen={isCommandOpen}
          onClose={() => setIsCommandOpen(false)}
        />
      </AnimatePresence>
    </>
  );
}

export default Header;

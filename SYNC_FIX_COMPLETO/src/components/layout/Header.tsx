'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Palette */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50"
      >
        <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar páginas, ações, contatos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder:text-slate-400 outline-none text-sm"
              autoFocus
            />
            <kbd className="px-2 py-1 text-xs bg-slate-800 rounded text-slate-400">
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
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                >
                  <div className="p-1.5 rounded-lg bg-slate-800">
                    <suggestion.icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <span className="text-sm text-white">{suggestion.label}</span>
                  <span className="ml-auto text-xs text-slate-500 capitalize">
                    {suggestion.type === 'page' ? 'Página' : 'Ação'}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-400">
                  Nenhum resultado encontrado
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-white/5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">↵</kbd>
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
        className="absolute right-0 top-full mt-2 w-96 bg-slate-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">Notificações</h3>
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
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">Nenhuma notificação</p>
              <p className="text-xs text-slate-500 mt-1">
                Você será notificado sobre eventos importantes
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors',
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
                        notification.read ? 'text-slate-300' : 'text-white'
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
                            className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
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
                          className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-slate-500">
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
          <div className="px-4 py-3 border-t border-white/5">
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

interface UserMenuDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    name: string;
    email: string;
    avatar?: string;
    plan: string;
  };
}

function UserMenuDropdown({ isOpen, onClose, user }: UserMenuDropdownProps) {
  const { theme, setTheme } = useUIStore();

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
      >
        {/* User Info */}
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Avatar fallback={user.name?.substring(0, 2) || 'U'} src={user.avatar} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Badge variant="primary">{user.plan}</Badge>
            <button className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              Upgrade
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-2">
          <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">Meu Perfil</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">Configurações da Loja</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors">
            <CreditCard className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">Faturamento</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">Ajuda & Suporte</span>
          </button>
        </div>

        {/* Theme Toggle */}
        <div className="px-4 py-2 border-t border-white/5">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-slate-400" />
              ) : (
                <Sun className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-sm text-slate-300">
                {theme === 'dark' ? 'Modo Escuro' : 'Modo Claro'}
              </span>
            </div>
            <div className="w-8 h-5 rounded-full bg-primary/20 relative">
              <div
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-primary transition-all',
                  theme === 'dark' ? 'left-0.5' : 'left-3.5'
                )}
              />
            </div>
          </button>
        </div>

        {/* Logout */}
        <div className="px-4 py-2 border-t border-white/5">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-red-400">
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Sair</span>
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
    plan: 'Pro',
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
      <header className="h-16 border-b border-white/5 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="h-full px-6 flex items-center justify-between gap-4">
          {/* Left: Title or Search */}
          <div className="flex items-center gap-4 flex-1">
            {title ? (
              <div>
                <h1 className="text-lg font-semibold text-white">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-slate-400">{subtitle}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsCommandOpen(true)}
                className="flex items-center gap-3 px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-white/5 rounded-xl transition-colors w-full max-w-md"
              >
                <Search className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-400 flex-1 text-left">
                  Buscar...
                </span>
                <kbd className="px-2 py-0.5 text-xs bg-slate-700 rounded text-slate-400">
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
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 transition-colors"
              >
                <Avatar fallback={userData.name?.substring(0, 2) || 'U'} size="sm" />
                <ChevronDown className="w-4 h-4 text-slate-400" />
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

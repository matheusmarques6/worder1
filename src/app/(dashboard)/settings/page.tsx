'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  User,
  Building2,
  CreditCard,
  Bell,
  Shield,
  Plug,
  Check,
  X,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Trash2,
  Plus,
  Key,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores';

// Types
interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.FC;
  connected: boolean;
  status: 'healthy' | 'warning' | 'error' | 'disconnected';
  lastSync?: string;
  stats?: Record<string, string | number>;
  warning?: string;
  category: 'ecommerce' | 'email' | 'messaging' | 'ads';
}

// Integration icons
const ShopifyIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#95BF47]">
    <path d="M15.337 3.415c-.042-.33-.378-.504-.63-.504-.252 0-.504.042-.504.042s-1.092.126-1.512.168c-.084.084-.168.21-.294.378-.378.63-.882 1.512-.882 1.512l-2.31 1.092c-.126.042-.252.084-.378.168-.168.084-.294.21-.378.378-.126.21-.168.462-.168.714v.042l-1.344 10.458c-.084.714.462 1.344 1.176 1.386.042 0 .084 0 .126 0h.042l6.888-.378c.714-.042 1.26-.672 1.218-1.386l-.84-12.6c-.042 0-.126-.042-.21-.084z"/>
  </svg>
);

const KlaviyoIcon = () => (
  <div className="w-6 h-6 bg-[#2a2a2a] rounded flex items-center justify-center">
    <span className="text-[#28c76f] font-bold text-xs">K</span>
  </div>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366]">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <circle cx="12" cy="12" r="12" fill="#1877F2"/>
    <path fill="white" d="M16.5 12.5h-2.5v8h-3v-8h-2v-2.5h2v-1.5c0-2.5 1-4 3.5-4h2.5v2.5h-1.5c-1 0-1.5.5-1.5 1.5v1.5h3l-.5 2.5z"/>
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <path fill="#FBBC04" d="M12 11.5l8.5-5c.8-.5 1.9.1 1.9 1v9c0 .9-1.1 1.5-1.9 1l-8.5-5"/>
    <path fill="#4285F4" d="M1.5 17.5v-11c0-.9 1-1.5 1.9-1l8.6 5-8.6 5c-.9.5-1.9-.1-1.9-1"/>
    <path fill="#34A853" d="M12 11.5l8.5 5c.8.5.8 1.6 0 2l-8.5 5c-.8.5-1.9-.1-1.9-1v-10c0-.9 1-1.5 1.9-1"/>
    <path fill="#EA4335" d="M12 11.5l-8.6-5c-.9-.5-.9-1.6 0-2l8.6-5c.9-.5 1.9.1 1.9 1v10c0 .9-1 1.5-1.9 1"/>
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <rect width="24" height="24" rx="4" fill="#000"/>
    <path fill="#25F4EE" d="M16.5 8.5c-1-.5-1.5-1.5-1.5-2.5h-2v10c0 1.5-1.5 2.5-3 2.5s-2.5-1.5-2.5-2.5c0-1.5 1-2.5 2.5-2.5v-2c-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5 4.5-2 4.5-4.5v-5c1 .5 2 1 3 1v-2c-.5 0-1-.5-1-.5z"/>
    <path fill="#FE2C55" d="M17.5 8c-1-.5-1.5-1.5-1.5-2.5h-2v10c0 1.5-1.5 2.5-3 2.5s-2.5-1.5-2.5-2.5c0-1.5 1-2.5 2.5-2.5v-2c-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5 4.5-2 4.5-4.5v-5c1 .5 2 1 3 1v-2c-.5 0-1-.5-1-.5z"/>
  </svg>
);

// Tabs
const settingsTabs = [
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'store', label: 'Loja', icon: Building2 },
  { id: 'billing', label: 'Faturamento', icon: CreditCard },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'security', label: 'Segurança', icon: Shield },
  { id: 'api', label: 'API', icon: Key },
];

// Badge Component
const Badge = ({ variant = 'default', children }: { variant?: 'success' | 'warning' | 'error' | 'default'; children: React.ReactNode }) => {
  const colors = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    default: 'bg-dark-700/50 text-dark-400 border-dark-600',
  };
  
  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', colors[variant])}>
      {children}
    </span>
  );
};

// Integration Card Component
const IntegrationCard = ({ 
  integration, 
  onConnect, 
  onDisconnect, 
  onSync,
  onSettings,
  isLoading 
}: { 
  integration: Integration;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onSettings: () => void;
  isLoading: boolean;
}) => {
  const Icon = integration.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl"
    >
      <div className="flex items-start gap-4">
        <div className="p-2 bg-dark-700/50 rounded-xl">
          <Icon />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white">{integration.name}</h3>
            {integration.connected ? (
              <Badge variant={integration.status === 'healthy' ? 'success' : integration.status === 'warning' ? 'warning' : 'error'}>
                {integration.status === 'healthy' ? 'Conectado' : integration.status === 'warning' ? 'Atenção' : 'Erro'}
              </Badge>
            ) : (
              <Badge variant="default">Desconectado</Badge>
            )}
          </div>
          
          <p className="text-sm text-dark-400 mt-1">{integration.description}</p>
          
          {integration.connected && integration.stats && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
              {Object.entries(integration.stats).map(([key, value]) => (
                <span key={key} className="text-dark-300">
                  <span className="capitalize">{key}:</span>{' '}
                  <span className="font-semibold text-white">{value}</span>
                </span>
              ))}
            </div>
          )}
          
          {integration.warning && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="text-xs text-yellow-400">{integration.warning}</span>
            </div>
          )}
          
          {integration.connected && integration.lastSync && (
            <p className="text-xs text-dark-500 mt-2">
              Última sincronização: {integration.lastSync}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {integration.connected ? (
            <>
              <button
                onClick={onSync}
                disabled={isLoading}
                className="p-2 hover:bg-dark-700/50 rounded-lg text-dark-400 hover:text-white transition-colors disabled:opacity-50"
                title="Sincronizar"
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              </button>
              <button
                onClick={onSettings}
                className="p-2 hover:bg-dark-700/50 rounded-lg text-dark-400 hover:text-white transition-colors"
                title="Configurações"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={onDisconnect}
                className="p-2 hover:bg-red-500/10 rounded-lg text-dark-400 hover:text-red-400 transition-colors"
                title="Desconectar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={onConnect}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Conectar
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Klaviyo Config Modal
const KlaviyoConfigModal = ({ 
  isOpen, 
  onClose, 
  onSave 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (apiKey: string) => void;
}) => {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setIsLoading(true);
    await onSave(apiKey);
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-dark-900 rounded-2xl border border-dark-700 p-6 w-full max-w-md"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-dark-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 mb-4">
          <KlaviyoIcon />
          <h3 className="text-lg font-semibold text-white">Conectar Klaviyo</h3>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="pk_xxxxxxxxxxxxxxxx"
              className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-dark-500 mt-2">
              Encontre em: Klaviyo → Account → Settings → API Keys
            </p>
          </div>
          
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || isLoading}
            className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-700 disabled:text-dark-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conectar
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('integrations');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingIntegration, setLoadingIntegration] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showKlaviyoModal, setShowKlaviyoModal] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey] = useState('worder_sk_live_xxxxxxxxxxxxxxxxxxxxx');
  
  const { stores } = useStoreStore();

  // Fetch integrations status
  const fetchIntegrations = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch real status from API
      const response = await fetch('/api/integrations/status');
      const data = await response.json();
      
      const status = data.integrations || {};

      const integrationsData: Integration[] = [
        // Ads section
        {
          id: 'meta',
          name: 'Facebook Ads',
          description: 'Acompanhe campanhas, ROAS e performance de anúncios',
          icon: FacebookIcon,
          connected: status.meta?.connected || false,
          status: status.meta?.status || 'disconnected',
          lastSync: status.meta?.lastSync,
          stats: status.meta?.accountName ? { Account: status.meta.accountName } : undefined,
          category: 'ads',
        },
        {
          id: 'google',
          name: 'Google Ads',
          description: 'Sincronize campanhas Search, Shopping e Display',
          icon: GoogleIcon,
          connected: status.google?.connected || false,
          status: status.google?.status || 'disconnected',
          lastSync: status.google?.lastSync,
          stats: status.google?.accountName ? { Account: status.google.accountName } : undefined,
          category: 'ads',
        },
        {
          id: 'tiktok',
          name: 'TikTok Ads',
          description: 'Monitore campanhas e performance de vídeos',
          icon: TikTokIcon,
          connected: status.tiktok?.connected || false,
          status: status.tiktok?.status || 'disconnected',
          lastSync: status.tiktok?.lastSync,
          stats: status.tiktok?.accountName ? { Account: status.tiktok.accountName } : undefined,
          category: 'ads',
        },
        // E-commerce section
        {
          id: 'shopify',
          name: 'Shopify',
          description: 'Sincronize pedidos, clientes e produtos',
          icon: ShopifyIcon,
          connected: status.shopify?.connected || stores.length > 0,
          status: (status.shopify?.connected || stores.length > 0) ? 'healthy' : 'disconnected',
          lastSync: status.shopify?.lastSync || (stores.length > 0 ? 'Agora' : undefined),
          stats: status.shopify?.stats || (stores.length > 0 ? { Orders: '0', Customers: '-', Products: '-' } : undefined),
          category: 'ecommerce',
        },
        // Email Marketing section
        {
          id: 'klaviyo',
          name: 'Klaviyo',
          description: 'Importe campanhas, flows e métricas de email',
          icon: KlaviyoIcon,
          connected: status.klaviyo?.connected || false,
          status: status.klaviyo?.status || 'disconnected',
          lastSync: status.klaviyo?.lastSync,
          stats: status.klaviyo?.accountName ? { Account: status.klaviyo.accountName } : undefined,
          category: 'email',
        },
        // Messaging section
        {
          id: 'whatsapp',
          name: 'WhatsApp Business',
          description: 'Envie mensagens e gerencie conversas',
          icon: WhatsAppIcon,
          connected: status.whatsapp?.connected || false,
          status: status.whatsapp?.status || 'disconnected',
          lastSync: status.whatsapp?.lastSync,
          stats: status.whatsapp?.phoneNumber ? { Phone: status.whatsapp.phoneNumber } : undefined,
          category: 'messaging',
        },
      ];

      setIntegrations(integrationsData);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [stores]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Handle OAuth connect
  const handleConnect = async (integrationId: string) => {
    setLoadingIntegration(integrationId);
    
    try {
      if (integrationId === 'shopify') {
        // Open add store modal
        window.dispatchEvent(new CustomEvent('openAddStoreModal'));
      } else if (integrationId === 'klaviyo') {
        setShowKlaviyoModal(true);
      } else if (['meta', 'google', 'tiktok'].includes(integrationId)) {
        // OAuth flow
        const response = await fetch(`/api/integrations/${integrationId}?action=auth_url`);
        const data = await response.json();
        
        if (data.authUrl) {
          window.location.href = data.authUrl;
        } else {
          alert('Erro ao iniciar conexão. Configure as credenciais no .env');
        }
      }
    } catch (error) {
      console.error('Connect error:', error);
      alert('Erro ao conectar integração');
    } finally {
      setLoadingIntegration(null);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (integrationId: string) => {
    if (!confirm(`Deseja realmente desconectar ${integrationId}?`)) return;
    
    setLoadingIntegration(integrationId);
    
    try {
      // TODO: Call API to disconnect
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setIntegrations(prev => prev.map(i => 
        i.id === integrationId 
          ? { ...i, connected: false, status: 'disconnected', stats: undefined, lastSync: undefined }
          : i
      ));
    } catch (error) {
      console.error('Disconnect error:', error);
    } finally {
      setLoadingIntegration(null);
    }
  };

  // Handle sync
  const handleSync = async (integrationId: string) => {
    setLoadingIntegration(integrationId);
    
    try {
      // TODO: Call API to sync
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setIntegrations(prev => prev.map(i => 
        i.id === integrationId 
          ? { ...i, lastSync: 'Agora' }
          : i
      ));
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setLoadingIntegration(null);
    }
  };

  // Handle Klaviyo save
  const handleKlaviyoSave = async (apiKeyValue: string) => {
    try {
      const response = await fetch('/api/klaviyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyValue }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setShowKlaviyoModal(false);
        alert('Klaviyo conectado com sucesso!');
        // Refresh integrations to get real status
        fetchIntegrations();
      } else {
        alert(data.error || 'Erro ao conectar Klaviyo');
      }
    } catch (error) {
      console.error('Klaviyo save error:', error);
      alert('Erro de conexão. Verifique sua internet e tente novamente.');
    }
  };

  // Group integrations by category
  const adsIntegrations = integrations.filter(i => i.category === 'ads');
  const ecommerceIntegrations = integrations.filter(i => i.category === 'ecommerce');
  const emailIntegrations = integrations.filter(i => i.category === 'email');
  const messagingIntegrations = integrations.filter(i => i.category === 'messaging');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-dark-400 mt-1">Gerencie sua conta e integrações</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <nav className="space-y-1 bg-dark-800/50 rounded-xl p-2 border border-dark-700/50">
            {settingsTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors',
                    activeTab === tab.id
                      ? 'bg-dark-700 text-white'
                      : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <motion.div
                key="integrations"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
                  </div>
                ) : (
                  <>
                    {/* Ads */}
                    <div>
                      <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="text-lg">📊</span> ANÚNCIOS
                      </h2>
                      <div className="space-y-3">
                        {adsIntegrations.map((integration) => (
                          <IntegrationCard
                            key={integration.id}
                            integration={integration}
                            onConnect={() => handleConnect(integration.id)}
                            onDisconnect={() => handleDisconnect(integration.id)}
                            onSync={() => handleSync(integration.id)}
                            onSettings={() => {}}
                            isLoading={loadingIntegration === integration.id}
                          />
                        ))}
                      </div>
                    </div>

                    {/* E-commerce */}
                    <div>
                      <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="text-lg">🛒</span> E-COMMERCE
                      </h2>
                      <div className="space-y-3">
                        {ecommerceIntegrations.map((integration) => (
                          <IntegrationCard
                            key={integration.id}
                            integration={integration}
                            onConnect={() => handleConnect(integration.id)}
                            onDisconnect={() => handleDisconnect(integration.id)}
                            onSync={() => handleSync(integration.id)}
                            onSettings={() => {}}
                            isLoading={loadingIntegration === integration.id}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Email Marketing */}
                    <div>
                      <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="text-lg">✉️</span> EMAIL MARKETING
                      </h2>
                      <div className="space-y-3">
                        {emailIntegrations.map((integration) => (
                          <IntegrationCard
                            key={integration.id}
                            integration={integration}
                            onConnect={() => handleConnect(integration.id)}
                            onDisconnect={() => handleDisconnect(integration.id)}
                            onSync={() => handleSync(integration.id)}
                            onSettings={() => {}}
                            isLoading={loadingIntegration === integration.id}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Messaging */}
                    <div>
                      <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="text-lg">💬</span> MENSAGENS
                      </h2>
                      <div className="space-y-3">
                        {messagingIntegrations.map((integration) => (
                          <IntegrationCard
                            key={integration.id}
                            integration={integration}
                            onConnect={() => handleConnect(integration.id)}
                            onDisconnect={() => handleDisconnect(integration.id)}
                            onSync={() => handleSync(integration.id)}
                            onSettings={() => {}}
                            isLoading={loadingIntegration === integration.id}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="p-6 bg-dark-800/50 rounded-xl border border-dark-700/50">
                  <h2 className="text-lg font-semibold text-white mb-6">Informações Pessoais</h2>
                  
                  <div className="flex items-center gap-6 mb-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-2xl font-bold">
                      JD
                    </div>
                    <div>
                      <button className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors">
                        Alterar foto
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-dark-400 mb-2">Nome</label>
                      <input
                        type="text"
                        defaultValue="João"
                        className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-dark-400 mb-2">Sobrenome</label>
                      <input
                        type="text"
                        defaultValue="Demo"
                        className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm text-dark-400 mb-2">Email</label>
                      <input
                        type="email"
                        defaultValue="joao@demo.com"
                        className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                  
                  <button className="mt-6 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors">
                    Salvar Alterações
                  </button>
                </div>
              </motion.div>
            )}

            {/* Store Tab */}
            {activeTab === 'store' && (
              <motion.div
                key="store"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="p-6 bg-dark-800/50 rounded-xl border border-dark-700/50">
                  <h2 className="text-lg font-semibold text-white mb-6">Lojas Conectadas</h2>
                  
                  {stores.length > 0 ? (
                    <div className="space-y-3">
                      {stores.map((store) => (
                        <div key={store.id} className="flex items-center gap-4 p-4 bg-dark-700/50 rounded-xl">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                            <Store className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-white">{store.name}</p>
                            <p className="text-sm text-dark-400">{store.domain}</p>
                          </div>
                          <Badge variant="success">Ativa</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Store className="w-12 h-12 text-dark-500 mx-auto mb-3" />
                      <p className="text-dark-400">Nenhuma loja conectada</p>
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('openAddStoreModal'))}
                        className="mt-4 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus className="w-4 h-4 inline mr-2" />
                        Adicionar Loja
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* API Tab */}
            {activeTab === 'api' && (
              <motion.div
                key="api"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="p-6 bg-dark-800/50 rounded-xl border border-dark-700/50">
                  <h2 className="text-lg font-semibold text-white mb-2">Chaves de API</h2>
                  <p className="text-dark-400 mb-6">
                    Use estas chaves para integrar com a API do Worder
                  </p>

                  <div>
                    <label className="text-sm font-medium text-white mb-2 block">
                      Chave de Produção
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center bg-dark-700 rounded-xl px-4 py-3 border border-dark-600">
                        <code className="flex-1 text-sm text-dark-300 font-mono">
                          {showApiKey ? apiKey : '•'.repeat(apiKey.length)}
                        </code>
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="p-1 hover:bg-dark-600 rounded"
                        >
                          {showApiKey ? (
                            <EyeOff className="w-4 h-4 text-dark-400" />
                          ) : (
                            <Eye className="w-4 h-4 text-dark-400" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(apiKey)}
                        className="p-3 bg-dark-700 hover:bg-dark-600 rounded-xl text-dark-400 hover:text-white transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-dark-800/50 rounded-xl border border-dark-700/50">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Documentação</h2>
                      <p className="text-dark-400">Aprenda a usar a API</p>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors">
                      <ExternalLink className="w-4 h-4" />
                      Abrir Docs
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Other tabs - simplified */}
            {['billing', 'notifications', 'security'].includes(activeTab) && (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-6 bg-dark-800/50 rounded-xl border border-dark-700/50"
              >
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-dark-500 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-white mb-2">Em breve</h3>
                  <p className="text-dark-400">Esta seção está em desenvolvimento</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Klaviyo Modal */}
      <KlaviyoConfigModal
        isOpen={showKlaviyoModal}
        onClose={() => setShowKlaviyoModal(false)}
        onSave={handleKlaviyoSave}
      />
    </div>
  );
}

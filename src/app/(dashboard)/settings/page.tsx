'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
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
  CheckCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore, useAuthStore } from '@/stores';
import WhatsAppConnectModal from '@/components/whatsapp/WhatsAppConnectModal';

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
  { id: 'store', label: 'Loja', icon: Store },
  { id: 'billing', label: 'Faturamento', icon: CreditCard },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'security', label: 'Segurança', icon: Shield },
  { id: 'api', label: 'API Keys', icon: Key },
];

// AI Provider Config for API Keys
const aiProviderConfig: Record<string, {
  name: string
  color: string
  bgColor: string
  icon: string
  docsUrl: string
  createKeyUrl: string
  description: string
}> = {
  openai: {
    name: 'OpenAI',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    icon: '🤖',
    docsUrl: 'https://platform.openai.com/docs',
    createKeyUrl: 'https://platform.openai.com/api-keys',
    description: 'GPT-5.2, GPT-5.1, GPT-5, GPT-5 Pro/Mini/Nano',
  },
  anthropic: {
    name: 'Anthropic',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    icon: '🧠',
    docsUrl: 'https://docs.anthropic.com',
    createKeyUrl: 'https://console.anthropic.com/settings/keys',
    description: 'Claude Opus 4.5, Sonnet 4.5, Haiku 4.5',
  },
  google: {
    name: 'Google AI',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    icon: '✨',
    docsUrl: 'https://ai.google.dev/docs',
    createKeyUrl: 'https://aistudio.google.com/app/apikey',
    description: 'Gemini 2.0 Flash, Gemini 1.5 Pro/Flash',
  },
  groq: {
    name: 'Groq',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    icon: '⚡',
    docsUrl: 'https://console.groq.com/docs',
    createKeyUrl: 'https://console.groq.com/keys',
    description: 'Llama 3.3 70B, Llama 3.2 Vision (Ultra-rápido)',
  },
  mistral: {
    name: 'Mistral',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    icon: '🌀',
    docsUrl: 'https://docs.mistral.ai',
    createKeyUrl: 'https://console.mistral.ai/api-keys',
    description: 'Mistral Large, Codestral',
  },
  deepseek: {
    name: 'DeepSeek',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
    icon: '🔍',
    docsUrl: 'https://platform.deepseek.com/docs',
    createKeyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'DeepSeek V3, DeepSeek R1 (Muito barato)',
  },
  xai: {
    name: 'xAI',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
    icon: '𝕏',
    docsUrl: 'https://docs.x.ai',
    createKeyUrl: 'https://console.x.ai',
    description: 'Grok 2, Grok 2 Vision',
  },
};

// API Key type
interface AIApiKey {
  id: string
  provider: string
  api_key_hint: string
  is_active: boolean
  is_valid: boolean
  last_validated_at?: string
  total_requests: number
  total_tokens_used: number
  last_used_at?: string
  created_at: string
}

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
  onSave: (privateKey: string, publicKey: string) => Promise<void>;
}) => {
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!privateKey.trim()) {
      setError('Private API Key é obrigatória');
      return;
    }
    if (!publicKey.trim()) {
      setError('Public API Key é obrigatória');
      return;
    }
    if (publicKey.trim().length !== 6) {
      setError('Public API Key deve ter 6 caracteres');
      return;
    }
    setIsLoading(true);
    setError(null);
    
    try {
      await onSave(privateKey, publicKey);
      // If successful, modal will be closed by parent
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar. Verifique suas API Keys.');
    } finally {
      setIsLoading(false);
    }
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
          {/* Private API Key */}
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Private API Key <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => {
                setPrivateKey(e.target.value);
                setError(null);
              }}
              placeholder="pk_xxxxxxxxxxxxxxxx"
              className={cn(
                "w-full px-4 py-2 bg-dark-800 border rounded-xl text-white placeholder-dark-500 focus:outline-none transition-colors",
                error && !privateKey.trim() ? "border-red-500/50 focus:border-red-500" : "border-dark-700 focus:border-primary-500"
              )}
            />
            <p className="text-xs text-dark-500 mt-1">
              Para ler dados (campanhas, flows, métricas, revenue)
            </p>
          </div>

          {/* Public API Key */}
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Public API Key / Site ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={publicKey}
              onChange={(e) => {
                setPublicKey(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="XXXXXX"
              maxLength={6}
              className={cn(
                "w-full px-4 py-2 bg-dark-800 border rounded-xl text-white placeholder-dark-500 focus:outline-none transition-colors font-mono tracking-wider",
                error && !publicKey.trim() ? "border-red-500/50 focus:border-red-500" : "border-dark-700 focus:border-primary-500"
              )}
            />
            <p className="text-xs text-dark-500 mt-1">
              Para tracking de eventos no site (6 caracteres)
            </p>
          </div>

          <div className="text-xs text-dark-400 bg-dark-800/50 p-3 rounded-lg space-y-2">
            <p className="font-medium text-dark-300">📍 Onde encontrar:</p>
            <div className="space-y-1">
              <p><span className="text-primary-400">Private Key:</span> Settings → API Keys → Create Private API Key</p>
              <p><span className="text-primary-400">Public Key:</span> Settings → API Keys → (topo da página)</p>
            </div>
            <div className="mt-2 pt-2 border-t border-dark-700/50">
              <p className="font-medium text-yellow-400/80 text-[10px]">⚠️ IMPORTANTE: Ao criar a Private Key, selecione "Full Access" ou habilite os scopes: accounts, campaigns, flows, lists, profiles, metrics, events</p>
            </div>
          </div>
          
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}
          
          <button
            onClick={handleSave}
            disabled={!privateKey.trim() || !publicKey.trim() || isLoading}
            className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-700 disabled:text-dark-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Conectando...' : 'Conectar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const configFromUrl = searchParams.get('config');
  
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'integrations');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingIntegration, setLoadingIntegration] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showKlaviyoModal, setShowKlaviyoModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey] = useState('worder_sk_live_xxxxxxxxxxxxxxxxxxxxx');
  
  // API Keys states
  const [aiApiKeys, setAiApiKeys] = useState<AIApiKey[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [selectedKeyProvider, setSelectedKeyProvider] = useState<string | null>(null);
  const [newKeyProvider, setNewKeyProvider] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [showNewKeyValue, setShowNewKeyValue] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  
  const { stores, currentStore } = useStoreStore(); // ✅ MODIFICADO: Adicionar currentStore
  const { user } = useAuthStore();
  const storeId = currentStore?.id; // ✅ NOVO

  // Update tab when URL changes
  useEffect(() => {
    if (tabFromUrl && settingsTabs.some(t => t.id === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // Open config modal when URL has config param
  useEffect(() => {
    if (configFromUrl === 'klaviyo') {
      setShowKlaviyoModal(true);
    }
  }, [configFromUrl]);

  // Fetch integrations status - ✅ MODIFICADO: Filtrar por storeId
  const fetchIntegrations = useCallback(async () => {
    // ✅ NOVO: Não buscar se não tiver loja selecionada
    if (!storeId) {
      setIntegrations([]);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Fetch real status from API - ✅ MODIFICADO: Incluir storeId
      const response = await fetch(`/api/integrations/status?storeId=${storeId}`);
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
  }, [stores, storeId]); // ✅ MODIFICADO: Adicionar storeId

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Fetch AI API Keys
  const fetchAiApiKeys = useCallback(async () => {
    try {
      setLoadingApiKeys(true);
      const response = await fetch('/api/api-keys');
      const data = await response.json();
      if (data.keys) {
        setAiApiKeys(data.keys);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    } finally {
      setLoadingApiKeys(false);
    }
  }, []);

  // Fetch API keys when tab changes to api
  useEffect(() => {
    if (activeTab === 'api') {
      fetchAiApiKeys();
    }
  }, [activeTab, fetchAiApiKeys]);

  // Save new API key
  const handleSaveApiKey = async () => {
    if (!newKeyProvider || !newKeyValue) {
      setKeyError('Selecione um provider e insira a API key');
      return;
    }

    setSavingKey(true);
    setKeyError('');

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: newKeyProvider, api_key: newKeyValue }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar API key');
      }

      // Success
      setShowAddKeyModal(false);
      setNewKeyProvider('');
      setNewKeyValue('');
      fetchAiApiKeys();
    } catch (err: any) {
      setKeyError(err.message);
    } finally {
      setSavingKey(false);
    }
  };

  // Delete API key
  const handleDeleteApiKey = async (provider: string) => {
    if (!confirm(`Deseja realmente remover a API key de ${aiProviderConfig[provider]?.name || provider}?`)) return;

    try {
      const res = await fetch(`/api/api-keys?provider=${provider}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchAiApiKeys();
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  };

  // Get configured providers
  const configuredProviders = aiApiKeys.map(k => k.provider);
  const availableProviders = Object.keys(aiProviderConfig).filter(p => !configuredProviders.includes(p));

  // Handle OAuth connect
  const handleConnect = async (integrationId: string) => {
    setLoadingIntegration(integrationId);
    
    try {
      if (integrationId === 'shopify') {
        // Open add store modal
        window.dispatchEvent(new CustomEvent('openAddStoreModal'));
      } else if (integrationId === 'klaviyo') {
        setShowKlaviyoModal(true);
      } else if (integrationId === 'whatsapp') {
        // Open WhatsApp connection modal
        setShowWhatsAppModal(true);
      } else if (['meta', 'google', 'tiktok'].includes(integrationId)) {
        // OAuth flow
        const response = await fetch(`/api/integrations/${integrationId}?action=auth_url`);
        const data = await response.json();
        
        if (data.authUrl) {
          window.location.href = data.authUrl;
        } else {
          console.error('Erro ao iniciar conexão. Configure as credenciais no .env');
        }
      }
    } catch (error) {
      console.error('Connect error:', error);
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
  const handleKlaviyoSave = async (privateKey: string, publicKey: string) => {
    try {
      const response = await fetch('/api/klaviyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiKey: privateKey,
          publicKey: publicKey || null
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setShowKlaviyoModal(false);
        
        // Update local state immediately to show connected
        setIntegrations(prev => prev.map(i => 
          i.id === 'klaviyo' 
            ? { 
                ...i, 
                connected: true, 
                status: 'healthy' as const, 
                lastSync: 'Agora',
                stats: data.account ? {
                  Account: data.account.name,
                  Profiles: data.account.profiles?.toLocaleString() || '0',
                } : undefined
              }
            : i
        ));
        
        // Refresh from server after a delay
        setTimeout(() => fetchIntegrations(), 2000);
      } else {
        // Show error in modal instead of alert
        console.error('Klaviyo error:', data.error);
        throw new Error(data.error || 'Erro ao conectar Klaviyo');
      }
    } catch (error: any) {
      console.error('Klaviyo save error:', error);
      // Re-throw to let modal handle it
      throw error;
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

            {/* API Keys Tab */}
            {activeTab === 'api' && (
              <motion.div
                key="api"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Header com botão adicionar */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">API Keys de IA</h2>
                    <p className="text-dark-400 text-sm">Configure suas chaves para usar modelos de IA</p>
                  </div>
                  <button
                    onClick={() => setShowAddKeyModal(true)}
                    disabled={availableProviders.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Key
                  </button>
                </div>

                {/* Info Banner */}
                <div className="p-4 rounded-xl bg-primary-500/10 border border-primary-500/20">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-primary-300 font-medium mb-1">Como funciona</p>
                      <p className="text-primary-400/80">
                        Você usa suas próprias API keys e paga diretamente aos providers (OpenAI, Anthropic, etc).
                        A Worder não cobra nada pelo uso de IA - você tem controle total sobre seus custos.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Loading */}
                {loadingApiKeys ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                  </div>
                ) : aiApiKeys.length === 0 ? (
                  /* Empty State */
                  <div className="p-8 bg-dark-800/50 rounded-xl border border-dark-700/50 text-center">
                    <Key className="w-12 h-12 text-dark-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">Nenhuma API key configurada</h3>
                    <p className="text-dark-400 mb-6">Configure suas API keys para usar agentes de IA</p>
                    <button
                      onClick={() => setShowAddKeyModal(true)}
                      className="px-6 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white rounded-xl font-medium transition-all"
                    >
                      <Plus className="w-4 h-4 inline mr-2" />
                      Adicionar Primeira Key
                    </button>
                  </div>
                ) : (
                  /* Cards de API Keys */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {aiApiKeys.map((key) => {
                      const config = aiProviderConfig[key.provider] || {
                        name: key.provider,
                        color: 'text-gray-400',
                        bgColor: 'bg-gray-500/20',
                        icon: '🔑',
                        description: '',
                      };

                      return (
                        <div
                          key={key.id}
                          className={`bg-dark-800/50 border rounded-xl p-5 ${
                            key.is_valid ? 'border-dark-700/50' : 'border-red-500/50'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center text-2xl`}>
                                {config.icon}
                              </div>
                              <div>
                                <h3 className={`font-medium ${config.color}`}>{config.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  {key.is_valid ? (
                                    <span className="flex items-center gap-1 text-xs text-green-400">
                                      <CheckCircle className="w-3 h-3" />
                                      Válida
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-red-400">
                                      <AlertCircle className="w-3 h-3" />
                                      Inválida
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteApiKey(key.provider)}
                              className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-dark-400">Chave</span>
                              <span className="text-dark-300 font-mono">{key.api_key_hint}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-dark-400">Requisições</span>
                              <span className="text-white">{key.total_requests.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-dark-400">Tokens usados</span>
                              <span className="text-white">{key.total_tokens_used.toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-dark-700/50">
                            <a
                              href={config.createKeyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                            >
                              Gerenciar no {config.name} <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      );
                    })}

                    {/* Card para adicionar mais */}
                    {availableProviders.length > 0 && (
                      <button
                        onClick={() => setShowAddKeyModal(true)}
                        className="bg-dark-800/30 border border-dashed border-dark-600 rounded-xl p-5 flex flex-col items-center justify-center min-h-[200px] hover:border-primary-500/50 hover:bg-dark-800/50 transition-all group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-dark-700/50 flex items-center justify-center mb-3 group-hover:bg-primary-500/20 transition-colors">
                          <Plus className="w-6 h-6 text-dark-400 group-hover:text-primary-400" />
                        </div>
                        <p className="text-dark-400 group-hover:text-white font-medium">Adicionar API Key</p>
                        <p className="text-dark-500 text-sm mt-1">{availableProviders.length} providers disponíveis</p>
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Modal Adicionar API Key */}
            <AnimatePresence>
              {showAddKeyModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
                  onClick={() => setShowAddKeyModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between p-6 border-b border-dark-700">
                      <h2 className="text-xl font-semibold text-white">Adicionar API Key</h2>
                      <button
                        onClick={() => setShowAddKeyModal(false)}
                        className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
                      {/* Provider Selection */}
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-3">Provider</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[280px] overflow-y-auto pr-1">
                          {availableProviders.map((p) => {
                            const cfg = aiProviderConfig[p];
                            if (!cfg) return null;
                            return (
                              <button
                                key={p}
                                onClick={() => setNewKeyProvider(p)}
                                className={`p-4 rounded-xl border transition-all text-left ${
                                  newKeyProvider === p
                                    ? 'border-primary-500 bg-primary-500/10'
                                    : 'border-dark-700/50 hover:border-dark-600 hover:bg-dark-700/30'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.name}</p>
                                    <p className="text-xs text-dark-400 mt-0.5 line-clamp-2">{cfg.description}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Provider Info */}
                      {newKeyProvider && aiProviderConfig[newKeyProvider] && (
                        <div className={`p-4 rounded-xl ${aiProviderConfig[newKeyProvider].bgColor}`}>
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{aiProviderConfig[newKeyProvider].icon}</span>
                            <div>
                              <h3 className={`font-medium ${aiProviderConfig[newKeyProvider].color}`}>
                                {aiProviderConfig[newKeyProvider].name}
                              </h3>
                              <p className="text-sm text-dark-400 mt-1">{aiProviderConfig[newKeyProvider].description}</p>
                              <div className="flex gap-3 mt-2">
                                <a
                                  href={aiProviderConfig[newKeyProvider].createKeyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                >
                                  Criar API Key <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={aiProviderConfig[newKeyProvider].docsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-dark-400 hover:text-white flex items-center gap-1"
                                >
                                  Documentação <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* API Key Input */}
                      {newKeyProvider && (
                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-2">API Key</label>
                          <div className="relative">
                            <input
                              type={showNewKeyValue ? 'text' : 'password'}
                              value={newKeyValue}
                              onChange={(e) => setNewKeyValue(e.target.value)}
                              placeholder={`Cole sua ${aiProviderConfig[newKeyProvider]?.name || newKeyProvider} API key aqui`}
                              className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 pr-12"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewKeyValue(!showNewKeyValue)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-dark-600 rounded"
                            >
                              {showNewKeyValue ? (
                                <EyeOff className="w-4 h-4 text-dark-400" />
                              ) : (
                                <Eye className="w-4 h-4 text-dark-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Error */}
                      {keyError && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          <span className="text-sm text-red-400">{keyError}</span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-dark-700 flex gap-3">
                      <button
                        onClick={() => {
                          setShowAddKeyModal(false);
                          setNewKeyProvider('');
                          setNewKeyValue('');
                          setKeyError('');
                        }}
                        className="flex-1 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveApiKey}
                        disabled={!newKeyProvider || !newKeyValue || savingKey}
                        className="flex-1 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {savingKey && <Loader2 className="w-4 h-4 animate-spin" />}
                        {savingKey ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

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

      {/* WhatsApp Connection Modal */}
      {user?.organization_id && (
        <WhatsAppConnectModal
          isOpen={showWhatsAppModal}
          onClose={() => setShowWhatsAppModal(false)}
          onSuccess={() => {
            setShowWhatsAppModal(false);
            fetchIntegrations();
          }}
          organizationId={user.organization_id}
        />
      )}
    </div>
  );
}

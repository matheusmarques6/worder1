'use client';

// =============================================
// Componente: Shopify Connect
// src/components/integrations/shopify/ShopifyConnect.tsx
// =============================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores';
import { 
  ShoppingBag,
  CheckCircle, 
  AlertCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  RefreshCw,
  Store,
  Package,
  Users,
  ShoppingCart,
  X,
  Zap,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Plus,
  Clock,
  Activity
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ConnectionStatus = 'active' | 'warning' | 'expired' | 'error' | 'reconnect_required' | 'pending';

interface ShopifyStore {
  id: string;
  name: string;
  domain: string;
  email?: string;
  currency?: string;
  status?: string;
  connectionStatus: ConnectionStatus;
  statusMessage?: string;
  healthCheckedAt?: string;
  consecutiveFailures?: number;
  totalOrders?: number;
  totalRevenue?: number;
  lastSyncAt?: string;
}

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

const STATUS_CONFIGS: Record<ConnectionStatus, StatusConfig> = {
  active: {
    label: 'Conectado',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20 border-emerald-500/30',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
  warning: {
    label: 'Atenção',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20 border-amber-500/30',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  expired: {
    label: 'Token Expirado',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20 border-red-500/30',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  error: {
    label: 'Erro',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20 border-red-500/30',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  reconnect_required: {
    label: 'Reconectar',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20 border-orange-500/30',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
  pending: {
    label: 'Pendente',
    color: 'text-dark-400',
    bgColor: 'bg-dark-700 border-dark-600',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: 'Autorização negada pelo Shopify',
  missing_params: 'Parâmetros inválidos',
  invalid_state: 'Sessão inválida - tente novamente',
  state_expired: 'Sessão expirada - tente novamente',
  save_failed: 'Erro ao salvar configuração',
};

export default function ShopifyConnect() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  
  const [stores, setStores] = useState<ShopifyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showNewStore, setShowNewStore] = useState(false);
  const [reconnectingStore, setReconnectingStore] = useState<ShopifyStore | null>(null);

  const [storeName, setStoreName] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const loadStores = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/shopify/connect`);
      const data = await response.json();
      
      if (response.ok && data.stores) {
        const formattedStores: ShopifyStore[] = data.stores.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          name: s.name as string,
          domain: s.domain as string,
          email: s.email as string | undefined,
          currency: s.currency as string | undefined,
          connectionStatus: (s.connectionStatus ?? s.connection_status ?? 'active') as ConnectionStatus,
          statusMessage: (s.statusMessage ?? s.status_message) as string | undefined,
          healthCheckedAt: (s.healthCheckedAt ?? s.health_checked_at) as string | undefined,
          consecutiveFailures: (s.consecutiveFailures ?? s.consecutive_failures ?? 0) as number,
          totalOrders: s.totalOrders as number | undefined,
          totalRevenue: s.totalRevenue as number | undefined,
          lastSyncAt: s.lastSyncAt as string | undefined,
        }));
        
        setStores(formattedStores);
        
        if (formattedStores.length === 0) {
          setShowNewStore(true);
        }
      }
    } catch (err) {
      console.error('Error loading stores:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');

    if (successParam === 'true') {
      setSuccess('Loja Shopify conectada com sucesso!');
      loadStores();
    } else if (errorParam) {
      setError(ERROR_MESSAGES[errorParam] ?? errorParam);
    }
  }, [searchParams, loadStores]);

  useEffect(() => {
    if (user?.organization_id) {
      loadStores();
    }
  }, [user?.organization_id, loadStores]);

  const checkHealth = async (store: ShopifyStore) => {
    setCheckingHealth(store.id);
    try {
      const response = await fetch('/api/integrations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'shopify',
          integrationId: store.id,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(`Conexão com ${store.name} verificada com sucesso!`);
      } else {
        setError(`${store.name}: ${data.message}`);
      }
      
      await loadStores();
      
    } catch (err) {
      setError('Erro ao verificar conexão');
    } finally {
      setCheckingHealth(null);
    }
  };

  const handleReconnect = (store: ShopifyStore) => {
    setReconnectingStore(store);
    setStoreName(store.name);
    setShopDomain(store.domain.replace('.myshopify.com', ''));
    setAccessToken('');
    setApiSecret('');
    setShowNewStore(true);
    
    setTimeout(() => {
      document.getElementById('new-store-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = storeName.trim();
    const trimmedDomain = shopDomain.trim();
    const trimmedToken = accessToken.trim();
    const trimmedSecret = apiSecret.trim();
    
    if (!trimmedName || !trimmedDomain || !trimmedToken || !trimmedSecret) {
      setError('Preencha todos os campos');
      return;
    }

    if (!user?.organization_id) {
      setError('Faça login para continuar');
      return;
    }

    setError('');
    setConnecting(true);

    try {
      const response = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          domain: trimmedDomain,
          accessToken: trimmedToken,
          apiSecret: trimmedSecret,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message ?? 'Loja conectada com sucesso!');
        resetForm();
        loadStores();
      } else {
        setError(data.error ?? 'Erro ao conectar');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (store: ShopifyStore) => {
    if (!confirm(`Desconectar a loja "${store.name}"?`)) return;

    try {
      setStores(prev => prev.filter(s => s.id !== store.id));
      setSuccess('Loja desconectada');
    } catch (err) {
      setError('Erro ao desconectar');
    }
  };

  const resetForm = () => {
    setShowNewStore(false);
    setReconnectingStore(null);
    setStoreName('');
    setShopDomain('');
    setAccessToken('');
    setApiSecret('');
  };

  const isErrorStatus = (status: ConnectionStatus): boolean => {
    return ['expired', 'error', 'reconnect_required'].includes(status);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#95BF47]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#95BF47]/20 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-[#95BF47]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Shopify</h2>
            <p className="text-sm text-dark-400">Conecte sua loja e sincronize dados</p>
          </div>
        </div>
        <button
          onClick={loadStores}
          className="p-2.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-xl transition-colors"
          aria-label="Atualizar"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-500/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess('')} className="p-1 hover:bg-emerald-500/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lojas Existentes */}
      {stores.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-dark-300">Suas Lojas Shopify</h3>
          {stores.map((store) => {
            const statusConfig = STATUS_CONFIGS[store.connectionStatus] ?? STATUS_CONFIGS.pending;
            const showAlert = isErrorStatus(store.connectionStatus);
            
            return (
              <div 
                key={store.id} 
                className={`p-4 bg-dark-800 border rounded-xl ${
                  showAlert ? 'border-red-500/50' : 'border-dark-700'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#95BF47]/20 rounded-xl flex items-center justify-center">
                      <Store className="w-6 h-6 text-[#95BF47]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white">{store.name}</h4>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${statusConfig.color} ${statusConfig.bgColor}`}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </span>
                      </div>
                      <p className="text-sm text-dark-400">{store.domain}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => checkHealth(store)}
                    disabled={checkingHealth === store.id}
                    className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
                    title="Verificar conexão"
                  >
                    {checkingHealth === store.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {showAlert && store.statusMessage && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-red-300">{store.statusMessage}</p>
                        <button
                          onClick={() => handleReconnect(store)}
                          className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-medium"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Reconectar agora
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {store.connectionStatus === 'active' && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-dark-500">Pedidos</p>
                      <p className="text-lg font-semibold text-white">{store.totalOrders ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-500">Receita</p>
                      <p className="text-lg font-semibold text-white">
                        R$ {(store.totalRevenue ?? 0).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-500">Última Sync</p>
                      <p className="text-sm text-dark-300">
                        {store.lastSyncAt 
                          ? formatDistanceToNow(new Date(store.lastSyncAt), { addSuffix: true, locale: ptBR })
                          : 'Nunca'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-dark-700">
                  <div className="text-xs text-dark-500">
                    {store.healthCheckedAt && (
                      <span>
                        Verificado {formatDistanceToNow(new Date(store.healthCheckedAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {showAlert && (
                      <button
                        onClick={() => handleReconnect(store)}
                        className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-lg transition-colors"
                        title="Reconectar"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDisconnect(store)}
                      className="p-2 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Desconectar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Botão Nova Loja */}
      {!showNewStore && (
        <button
          onClick={() => setShowNewStore(true)}
          className="w-full p-4 border-2 border-dashed border-dark-700 hover:border-[#95BF47]/50 rounded-xl text-dark-400 hover:text-[#95BF47] transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          {stores.length > 0 ? 'Adicionar Nova Loja' : 'Conectar Loja Shopify'}
        </button>
      )}

      {/* Formulário */}
      {showNewStore && (
        <div id="new-store-form" className="p-5 bg-dark-800 border border-dark-700 rounded-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white">
              {reconnectingStore ? `Reconectar: ${reconnectingStore.name}` : 'Conectar Nova Loja'}
            </h3>
            <button
              onClick={resetForm}
              className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-medium mb-2">Como obter as credenciais:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-300/80">
                  <li>No Shopify, vá em <strong>Configurações → Apps</strong></li>
                  <li>Clique em <strong>Desenvolver apps</strong></li>
                  <li>Crie ou selecione um app</li>
                  <li>Copie o <strong>Access Token</strong> e <strong>API Secret</strong></li>
                </ol>
                <a 
                  href="https://help.shopify.com/en/manual/apps/custom-apps" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300"
                >
                  Ver tutorial
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Nome da Loja <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Minha Loja"
                  className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-[#95BF47] transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Domínio <span className="text-red-400">*</span>
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    placeholder="minhaloja"
                    className="flex-1 px-4 py-3 bg-dark-900 border border-dark-700 rounded-l-xl text-white placeholder-dark-500 focus:outline-none focus:border-[#95BF47] transition-colors"
                    required
                  />
                  <span className="px-3 py-3 bg-dark-700 border border-dark-700 rounded-r-xl text-dark-400 text-sm whitespace-nowrap">
                    .myshopify.com
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Admin API Access Token <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 pr-12 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-[#95BF47] transition-colors font-mono text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                >
                  {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-dark-400 mb-2">
                API Secret Key <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="shpss_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 pr-12 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-[#95BF47] transition-colors font-mono text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                >
                  {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={connecting || !storeName || !shopDomain || !accessToken || !apiSecret}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#95BF47] hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <Store className="w-5 h-5" />
                    {reconnectingStore ? 'Reconectar' : 'Conectar'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* O que sincroniza */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl text-center">
          <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
          <p className="text-xs text-dark-300">Clientes</p>
        </div>
        <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl text-center">
          <Package className="w-5 h-5 text-green-400 mx-auto mb-1" />
          <p className="text-xs text-dark-300">Pedidos</p>
        </div>
        <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl text-center">
          <ShoppingCart className="w-5 h-5 text-amber-400 mx-auto mb-1" />
          <p className="text-xs text-dark-300">Carrinhos</p>
        </div>
        <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl text-center">
          <Zap className="w-5 h-5 text-purple-400 mx-auto mb-1" />
          <p className="text-xs text-dark-300">Tempo Real</p>
        </div>
      </div>
    </div>
  );
}

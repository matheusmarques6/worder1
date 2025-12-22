'use client';

// =============================================
// Componente: Shopify Connect (Simplificado)
// NÃO mostra tokens no frontend
// src/components/integrations/shopify/ShopifyConnect.tsx
// =============================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores';
import { 
  ShoppingBag,
  CheckCircle, 
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
  ExternalLink,
  Store,
  Package,
  Users,
  ShoppingCart,
  X,
  ArrowRight,
  Zap,
  ChevronDown,
  ChevronUp,
  Settings
} from 'lucide-react';

interface ShopifyStore {
  id: string;
  name: string;
  domain: string;
  email?: string;
  currency?: string;
  isActive: boolean;
  totalOrders?: number;
  totalRevenue?: number;
  lastSyncAt?: string;
}

export default function ShopifyConnect() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  
  const [stores, setStores] = useState<ShopifyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form simples
  const [shopDomain, setShopDomain] = useState('');
  
  // Modo avançado (credenciais diretas) - colapsado por padrão
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  // Verificar parâmetros da URL (callback OAuth)
  useEffect(() => {
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');

    if (successParam === 'true') {
      setSuccess('Loja Shopify conectada com sucesso!');
      loadStores();
    } else if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_denied: 'Autorização negada',
        missing_params: 'Parâmetros inválidos',
        invalid_state: 'Sessão inválida - tente novamente',
        state_expired: 'Sessão expirada - tente novamente',
        save_failed: 'Erro ao salvar',
        oauth_not_configured: 'OAuth não configurado - use credenciais diretas',
      };
      setError(errorMessages[errorParam] || errorParam);
      // Se OAuth não está configurado, mostrar modo avançado
      if (errorParam === 'oauth_not_configured') {
        setShowAdvanced(true);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (user?.organization_id) {
      loadStores();
    }
  }, [user?.organization_id]);

  const loadStores = async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      
      const response = await fetch(`/api/shopify/connect?organizationId=${user.organization_id}`);
      const data = await response.json();
      
      if (response.ok && data.stores) {
        setStores(data.stores);
      }
    } catch (err) {
      console.error('Error loading stores:', err);
    } finally {
      setLoading(false);
    }
  };

  // Conectar via OAuth (método principal)
  const handleConnectOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!shopDomain.trim()) {
      setError('Digite o domínio da sua loja');
      return;
    }

    if (!user?.organization_id) {
      setError('Faça login para continuar');
      return;
    }

    setError('');
    setConnecting(true);

    try {
      const response = await fetch(
        `/api/integrations/shopify/auth?organizationId=${user.organization_id}&shop=${encodeURIComponent(shopDomain.trim())}`
      );

      const data = await response.json();

      if (response.ok && data.authUrl) {
        // Redirecionar para Shopify OAuth
        window.location.href = data.authUrl;
      } else {
        // Se OAuth não funcionar, mostrar opção de credenciais
        if (data.error?.includes('not configured') || data.error?.includes('SHOPIFY_CLIENT_ID')) {
          setShowAdvanced(true);
          setError('OAuth não configurado. Use credenciais diretas abaixo.');
        } else {
          setError(data.error || 'Erro ao conectar');
        }
        setConnecting(false);
      }
    } catch (err) {
      setError('Erro de conexão');
      setConnecting(false);
    }
  };

  // Conectar via Credenciais Diretas (modo avançado)
  const handleConnectCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!storeName.trim() || !shopDomain.trim() || !accessToken.trim() || !apiSecret.trim()) {
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
          name: storeName.trim(),
          domain: shopDomain.trim(),
          accessToken: accessToken.trim(),
          apiSecret: apiSecret.trim(),
          organizationId: user.organization_id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Loja conectada com sucesso!');
        // Limpar form
        setStoreName('');
        setShopDomain('');
        setAccessToken('');
        setApiSecret('');
        setShowAdvanced(false);
        loadStores();
      } else {
        setError(data.error || 'Erro ao conectar');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (storeId: string, storeName: string) => {
    if (!confirm(`Desconectar a loja "${storeName}"?`)) return;

    try {
      // A API de desconexão pode ser implementada depois
      // Por enquanto apenas remove da lista visual
      setStores(stores.filter(s => s.id !== storeId));
      setSuccess('Loja desconectada');
    } catch (err) {
      setError('Erro ao desconectar');
    }
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
          title="Atualizar"
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

      {/* Lojas Conectadas */}
      {stores.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-dark-300">Lojas Conectadas</h3>
          {stores.map((store) => (
            <div key={store.id} className="p-4 bg-dark-800 border border-dark-700 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#95BF47]/20 rounded-lg flex items-center justify-center">
                    <Store className="w-5 h-5 text-[#95BF47]" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{store.name}</h4>
                    <p className="text-sm text-dark-400">{store.domain}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                    store.isActive 
                      ? 'text-emerald-400 bg-emerald-500/20'
                      : 'text-red-400 bg-red-500/20'
                  }`}>
                    {store.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                  <button
                    onClick={() => handleDisconnect(store.id, store.name)}
                    className="p-2 text-dark-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Desconectar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Stats */}
              {(store.totalOrders !== undefined || store.totalRevenue !== undefined) && (
                <div className="mt-3 pt-3 border-t border-dark-700 flex gap-6">
                  <div>
                    <p className="text-xs text-dark-500">Pedidos</p>
                    <p className="text-sm font-medium text-white">{store.totalOrders || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-500">Receita</p>
                    <p className="text-sm font-medium text-white">
                      R$ {(store.totalRevenue || 0).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {store.lastSyncAt && (
                    <div>
                      <p className="text-xs text-dark-500">Última sync</p>
                      <p className="text-sm text-dark-300">
                        {new Date(store.lastSyncAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Conectar Nova Loja */}
      <div className="p-5 bg-dark-800 border border-dark-700 rounded-xl space-y-4">
        <h3 className="font-medium text-white">
          {stores.length > 0 ? 'Conectar Outra Loja' : 'Conectar Loja Shopify'}
        </h3>

        {/* Form Principal - Simples */}
        <form onSubmit={handleConnectOAuth} className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Domínio da Loja
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="minhaloja"
                className="flex-1 px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-[#95BF47] transition-colors"
              />
              <span className="flex items-center text-dark-500 text-sm">.myshopify.com</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={connecting || !shopDomain.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#95BF47] hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
          >
            {connecting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Conectar com Shopify
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Modo Avançado (Credenciais Diretas) */}
        <div className="border-t border-dark-700 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-dark-400 hover:text-dark-300"
          >
            <Settings className="w-4 h-4" />
            Configuração Avançada
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <form onSubmit={handleConnectCredentials} className="mt-4 space-y-4 p-4 bg-dark-900 rounded-xl">
              <p className="text-xs text-dark-500 mb-3">
                Use credenciais de um Custom App criado no admin do Shopify.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5">Nome da Loja</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Minha Loja"
                    className="w-full px-3 py-2.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-[#95BF47]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5">Domínio</label>
                  <input
                    type="text"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    placeholder="minhaloja"
                    className="w-full px-3 py-2.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-[#95BF47]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-dark-400 mb-1.5">Access Token</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="shpat_..."
                  className="w-full px-3 py-2.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-[#95BF47] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-dark-400 mb-1.5">API Secret</label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="shpss_..."
                  className="w-full px-3 py-2.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-[#95BF47] font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={connecting}
                className="w-full py-2.5 bg-dark-700 hover:bg-dark-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {connecting ? 'Conectando...' : 'Conectar com Credenciais'}
              </button>
            </form>
          )}
        </div>
      </div>

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

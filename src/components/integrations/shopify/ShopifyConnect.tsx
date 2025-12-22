'use client';

// =============================================
// Componente: Shopify Connect
// Mostra lojas existentes do banco + opção de nova
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
  ChevronDown,
  ChevronUp,
  Link2
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
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mostrar formulário de nova loja
  const [showNewStore, setShowNewStore] = useState(false);

  // Form para nova loja
  const [storeName, setStoreName] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Verificar parâmetros da URL
  useEffect(() => {
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');

    if (successParam === 'true') {
      setSuccess('Loja Shopify conectada com sucesso!');
      loadStores();
    } else if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_denied: 'Autorização negada pelo Shopify',
        missing_params: 'Parâmetros inválidos',
        invalid_state: 'Sessão inválida - tente novamente',
        state_expired: 'Sessão expirada - tente novamente',
        save_failed: 'Erro ao salvar configuração',
      };
      setError(errorMessages[errorParam] || errorParam);
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
        // Se não tem lojas, mostrar formulário automaticamente
        if (data.stores.length === 0) {
          setShowNewStore(true);
        }
      }
    } catch (err) {
      console.error('Error loading stores:', err);
    } finally {
      setLoading(false);
    }
  };

  // Reconectar loja existente (atualizar credenciais)
  const handleReconnect = async (store: ShopifyStore) => {
    // Preencher form com dados da loja existente
    setStoreName(store.name);
    setShopDomain(store.domain.replace('.myshopify.com', ''));
    setShowNewStore(true);
    setReconnecting(store.id);
    
    // Scroll para o formulário
    setTimeout(() => {
      document.getElementById('new-store-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Conectar nova loja ou atualizar existente
  const handleConnect = async (e: React.FormEvent) => {
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
        setSuccess(data.message || 'Loja conectada com sucesso!');
        // Limpar form
        setStoreName('');
        setShopDomain('');
        setAccessToken('');
        setApiSecret('');
        setShowNewStore(false);
        setReconnecting(null);
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
      // TODO: Chamar API de desconexão
      setStores(stores.filter(s => s.id !== storeId));
      setSuccess('Loja desconectada');
    } catch (err) {
      setError('Erro ao desconectar');
    }
  };

  const cancelNewStore = () => {
    setShowNewStore(false);
    setReconnecting(null);
    setStoreName('');
    setShopDomain('');
    setAccessToken('');
    setApiSecret('');
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
          {stores.map((store) => (
            <div key={store.id} className="p-4 bg-dark-800 border border-dark-700 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#95BF47]/20 rounded-xl flex items-center justify-center">
                    <Store className="w-6 h-6 text-[#95BF47]" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">{store.name}</h4>
                    <p className="text-sm text-dark-400">{store.domain}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {store.isActive ? (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/20 border border-emerald-500/30">
                      ✓ Conectada
                    </span>
                  ) : (
                    <button
                      onClick={() => handleReconnect(store)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 transition-colors flex items-center gap-1"
                    >
                      <Link2 className="w-3 h-3" />
                      Reconectar
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnect(store.id, store.name)}
                    className="p-2 text-dark-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Stats */}
              {store.isActive && (
                <div className="mt-4 pt-4 border-t border-dark-700 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-dark-500">Pedidos</p>
                    <p className="text-lg font-semibold text-white">{store.totalOrders || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-500">Receita</p>
                    <p className="text-lg font-semibold text-white">
                      R$ {(store.totalRevenue || 0).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-500">Última Sync</p>
                    <p className="text-sm text-dark-300">
                      {store.lastSyncAt 
                        ? new Date(store.lastSyncAt).toLocaleDateString('pt-BR')
                        : 'Nunca'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Botão para Nova Loja */}
      {!showNewStore && (
        <button
          onClick={() => setShowNewStore(true)}
          className="w-full p-4 border-2 border-dashed border-dark-700 hover:border-[#95BF47]/50 rounded-xl text-dark-400 hover:text-[#95BF47] transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          {stores.length > 0 ? 'Adicionar Nova Loja' : 'Conectar Loja Shopify'}
        </button>
      )}

      {/* Formulário Nova Loja / Reconectar */}
      {showNewStore && (
        <div id="new-store-form" className="p-5 bg-dark-800 border border-dark-700 rounded-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white">
              {reconnecting ? 'Atualizar Credenciais' : 'Conectar Nova Loja'}
            </h3>
            <button
              onClick={cancelNewStore}
              className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Instruções */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-medium mb-2">Como obter as credenciais:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-300/80">
                  <li>No Shopify, vá em <strong>Configurações → Apps e canais</strong></li>
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

          {/* Formulário */}
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
                onClick={cancelNewStore}
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
                    {reconnecting ? 'Atualizar' : 'Conectar'}
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

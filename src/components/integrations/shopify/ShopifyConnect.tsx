'use client';

// =============================================
// Shopify Integration Card
// src/components/integrations/shopify/ShopifyConnect.tsx
//
// Two states:
// - Disconnected: Domain input + OAuth connect button
// - Connected: Status card with webhooks, sync, tracking info
// =============================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores';
import {
  ShoppingBag,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Store,
  Package,
  Users,
  ShoppingCart,
  X,
  Zap,
  ExternalLink,
  Activity,
  Unplug,
  Eye,
  Radio,
  Palette,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShopifyStore {
  id: string;
  shop_name: string;
  shop_domain: string;
  shop_email?: string;
  currency?: string;
  plan_name?: string;
  is_active: boolean;
  connection_status: string;
  status?: string;
  pixel_installed?: boolean;
  embed_installed?: boolean;
  initial_sync_completed?: boolean;
  api_version?: string;
  total_orders?: number;
  total_revenue?: number;
  total_customers?: number;
  last_sync_at?: string;
  installed_at?: string;
  settings?: {
    theme_editor_url?: string;
    tracking_endpoint?: string;
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: 'Autorização negada pelo Shopify',
  missing_params: 'Parâmetros inválidos na resposta',
  invalid_state: 'Sessão inválida — tente novamente',
  state_expired: 'Sessão expirada — tente novamente',
  save_failed: 'Erro ao salvar configuração',
  oauth_not_configured: 'Credenciais OAuth não configuradas no servidor',
};

export default function ShopifyConnect() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();

  const [store, setStore] = useState<ShopifyStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shopDomain, setShopDomain] = useState('');

  // Load connected store
  const loadStore = useCallback(async () => {
    if (!user?.organization_id) return;
    try {
      setLoading(true);
      const response = await fetch('/api/shopify/connect');
      const data = await response.json();

      if (response.ok && data.stores?.length > 0) {
        const s = data.stores[0];
        setStore({
          id: s.id,
          shop_name: s.name || s.shop_name,
          shop_domain: s.domain || s.shop_domain,
          shop_email: s.email || s.shop_email,
          currency: s.currency,
          plan_name: s.plan_name,
          is_active: s.is_active ?? true,
          connection_status: s.connectionStatus || s.connection_status || 'active',
          status: s.status,
          pixel_installed: s.pixel_installed,
          embed_installed: s.embed_installed,
          initial_sync_completed: s.initial_sync_completed,
          api_version: s.api_version,
          total_orders: s.totalOrders || s.total_orders,
          total_revenue: s.totalRevenue || s.total_revenue,
          total_customers: s.totalCustomers || s.total_customers,
          last_sync_at: s.lastSyncAt || s.last_sync_at,
          installed_at: s.installed_at,
          settings: s.settings,
        });
      } else {
        setStore(null);
      }
    } catch {
      console.error('Error loading store');
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  // Handle OAuth redirect params
  useEffect(() => {
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');
    const shopifyParam = searchParams.get('shopify');

    if (successParam === 'true' || shopifyParam === 'connected') {
      const webhooks = searchParams.get('webhooks');
      const pixel = searchParams.get('pixel');
      setSuccess(
        `Loja conectada com sucesso! ${webhooks ? `${webhooks} webhooks registrados.` : ''} ${pixel === 'true' ? 'Pixel instalado.' : ''}`
      );
      loadStore();
    } else if (errorParam) {
      setError(ERROR_MESSAGES[errorParam] ?? decodeURIComponent(errorParam));
    }
  }, [searchParams, loadStore]);

  useEffect(() => {
    if (user?.organization_id) {
      loadStore();
    }
  }, [user?.organization_id, loadStore]);

  // OAuth Connect
  const handleConnect = async () => {
    const domain = shopDomain.trim().replace('.myshopify.com', '');
    if (!domain) {
      setError('Informe o domínio da loja');
      return;
    }

    setError('');
    setConnecting(true);

    try {
      const res = await fetch(`/api/integrations/shopify/auth?shop=${domain}.myshopify.com`);
      const data = await res.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setError(data.error || 'Erro ao gerar URL de autorização');
        setConnecting(false);
      }
    } catch {
      setError('Erro de conexão com o servidor');
      setConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (!store) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/integrations/shopify/${store.id}/disconnect`, {
        method: 'POST',
      });
      if (res.ok) {
        setStore(null);
        setSuccess('Loja desconectada. Dados importados foram mantidos.');
        setShowDisconnectConfirm(false);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao desconectar');
      }
    } catch {
      setError('Erro ao desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  // Force Resync
  const handleResync = async () => {
    if (!store) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/shopify/full-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, useGraphQL: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Sync concluído: ${data.data?.ordersCount || 0} pedidos, ${data.data?.customersCount || 0} clientes`);
        loadStore();
      } else {
        setError(data.error || 'Erro no sync');
      }
    } catch {
      setError('Erro ao sincronizar');
    } finally {
      setSyncing(false);
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
            <h2 className="text-xl font-semibold text-gray-900">Shopify</h2>
            <p className="text-sm text-gray-500">
              {store ? store.shop_domain : 'Conecte sua loja para sincronizar dados'}
            </p>
          </div>
        </div>
        {store && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5" />
              Conectada
            </span>
            <button
              onClick={loadStore}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 text-sm">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 text-sm">{success}</span>
          <button onClick={() => setSuccess('')} className="p-1 hover:bg-emerald-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================ */}
      {/* DISCONNECTED STATE — OAuth connect card      */}
      {/* ============================================ */}
      {!store && (
        <>
          <div className="p-6 bg-white border border-gray-200 rounded-xl space-y-5">
            <p className="text-sm text-gray-600">
              Conecte sua loja para sincronizar pedidos, clientes, carrinhos abandonados e ativar tracking completo.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Domínio da sua loja
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value.replace(/\s/g, ''))}
                  placeholder="minhaloja"
                  className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-l-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                />
                <span className="px-4 py-3 bg-gray-50 border border-l-0 border-gray-300 rounded-r-xl text-gray-500 text-sm whitespace-nowrap flex items-center">
                  .myshopify.com
                </span>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Encontre em: Shopify Admin &rarr; Configurações &rarr; Domínios
              </p>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting || !shopDomain.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#95BF47] hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Redirecionando para Shopify...
                </>
              ) : (
                <>
                  <Store className="w-5 h-5" />
                  Conectar Loja Shopify
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* What syncs */}
          <div>
            <p className="text-sm font-medium text-gray-600 mb-3">O que será sincronizado:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Package, label: 'Pedidos e status em tempo real', color: 'text-green-500' },
                { icon: Users, label: 'Clientes e dados de contato', color: 'text-blue-500' },
                { icon: ShoppingCart, label: 'Carrinhos e checkouts abandonados', color: 'text-amber-500' },
                { icon: ShoppingBag, label: 'Catálogo de produtos', color: 'text-purple-500' },
                { icon: Eye, label: 'Tracking comportamental (visitas, cliques)', color: 'text-indigo-500' },
                { icon: Zap, label: 'Código de rastreio e status de entrega', color: 'text-rose-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 p-2 text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ============================================ */}
      {/* CONNECTED STATE — Status card                */}
      {/* ============================================ */}
      {store && (
        <>
          {/* Store Info */}
          <div className="p-5 bg-white border border-gray-200 rounded-xl">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Loja</span>
                <p className="font-medium text-gray-900">{store.shop_name || store.shop_domain}</p>
              </div>
              <div>
                <span className="text-gray-400">Domínio</span>
                <p className="font-medium text-gray-900">{store.shop_domain}</p>
              </div>
              <div>
                <span className="text-gray-400">Conectada em</span>
                <p className="font-medium text-gray-900">
                  {store.installed_at
                    ? new Date(store.installed_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })
                    : '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Moeda</span>
                <p className="font-medium text-gray-900">{store.currency || 'BRL'}</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-white border border-gray-200 rounded-xl text-center">
              <Package className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-gray-900">{store.total_orders ?? 0}</p>
              <p className="text-xs text-gray-400">Pedidos</p>
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-xl text-center">
              <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-gray-900">{store.total_customers ?? 0}</p>
              <p className="text-xs text-gray-400">Clientes</p>
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-xl text-center">
              <ShoppingBag className="w-5 h-5 text-purple-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-gray-900">
                R$ {((store.total_revenue ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-gray-400">Receita</p>
            </div>
          </div>

          {/* Integration Status */}
          <div className="p-5 bg-white border border-gray-200 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Status da Integração</h3>

            <div className="space-y-2">
              <StatusRow
                label="Webhooks"
                active={store.connection_status === 'active'}
                detail={store.connection_status === 'active' ? 'Ativos' : 'Verificando...'}
              />
              <StatusRow
                label="Sync inicial"
                active={!!store.initial_sync_completed}
                detail={
                  store.initial_sync_completed
                    ? `Completo (${store.total_orders ?? 0} pedidos, ${store.total_customers ?? 0} clientes)`
                    : 'Pendente'
                }
              />
              <StatusRow
                label="Tracking (Pixel)"
                active={!!store.pixel_installed}
                detail={store.pixel_installed ? 'Instalado' : 'Pendente'}
              />
              <StatusRow
                label="Tracking (Tema)"
                active={!!store.embed_installed}
                detail={store.embed_installed ? 'Ativo' : 'Pendente — ativar nos App Embeds'}
              />
              <div className="flex items-center justify-between text-sm pt-1">
                <span className="text-gray-500 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Última atividade
                </span>
                <span className="text-gray-700">
                  {store.last_sync_at
                    ? formatDistanceToNow(new Date(store.last_sync_at), { addSuffix: true, locale: ptBR })
                    : 'Nunca'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleResync}
              disabled={syncing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Sincronizando...' : 'Forçar Sync'}
            </button>
            <a
              href={`https://${store.shop_domain}/admin`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Admin Shopify
            </a>
          </div>

          {/* Theme Tracking Guide */}
          {!store.embed_installed && (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Palette className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800 mb-2">Ativar Tracking no Tema</h4>
                  <p className="text-sm text-amber-700 mb-3">
                    Para rastrear visitantes e identificar clientes automaticamente:
                  </p>
                  <ol className="list-decimal list-inside text-sm text-amber-700 space-y-1 mb-3">
                    <li>Vá em <strong>Loja Online &rarr; Temas &rarr; Personalizar</strong></li>
                    <li>Clique em <strong>App Embeds</strong> (icone de quebra-cabeça na sidebar)</li>
                    <li>Ative o toggle <strong>&quot;Worder Tracking&quot;</strong></li>
                    <li>Clique <strong>Salvar</strong></li>
                  </ol>
                  {store.settings?.theme_editor_url && (
                    <a
                      href={store.settings.theme_editor_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                    >
                      Abrir Editor de Tema
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Danger Zone */}
          <div className="p-5 bg-white border border-red-200 rounded-xl">
            <h4 className="text-sm font-semibold text-red-700 mb-2">Zona de Perigo</h4>
            {!showDisconnectConfirm ? (
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Unplug className="w-4 h-4" />
                Desconectar Loja
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-600">
                  Tem certeza? Isso irá remover webhooks e parar a sincronização. Os dados já importados serão mantidos.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDisconnectConfirm(false)}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                    {disconnecting ? 'Desconectando...' : 'Confirmar Desconexão'}
                  </button>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Os dados já importados (pedidos, contatos, eventos) serão mantidos.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Status Row Component
// ============================================

function StatusRow({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 flex items-center gap-2">
        {active ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-gray-300" />
        )}
        {label}
      </span>
      <span className={active ? 'text-emerald-600 font-medium' : 'text-gray-500'}>{detail}</span>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useStoreStore } from '@/stores';
import {
  ShoppingBag, CheckCircle, AlertCircle, Loader2, Trash2,
  Store, ExternalLink, Wifi, RefreshCw,
} from 'lucide-react';

interface StoreData {
  id: string;
  shopDomain: string;
  shopName: string;
  shopEmail: string;
  currency: string;
  planName: string;
  apiVersion: string;
  status: string;
  initialSyncCompleted: boolean;
  pixelInstalled: boolean;
  embedInstalled: boolean;
  installedAt: string;
  lastSyncAt: string;
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
}

export default function ShopifyConnect() {
  const searchParams = useSearchParams();
  const { currentStore } = useStoreStore();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [store, setStore] = useState<StoreData | null>(null);
  const [shopDomain, setShopDomain] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchStatus();

    const success = searchParams.get('success');
    const urlError = searchParams.get('error');
    const webhooks = searchParams.get('webhooks');

    if (success === 'true') {
      setSuccessMessage(`Loja conectada! ${webhooks ? `${webhooks} webhooks registrados.` : ''}`);
    }
    if (urlError) {
      setError(getErrorMessage(urlError));
    }
  }, [searchParams]);

  async function fetchStatus() {
    try {
      setLoading(true);

      // Try dedicated status endpoint first
      const storeParam = currentStore?.id ? `?store_id=${currentStore.id}` : '';
      const res = await fetch(`/api/integrations/shopify/status${storeParam}`);
      const data = await res.json();

      if (data.connected && data.store) {
        setConnected(true);
        setStore(data.store);
        return;
      }

      // Fallback: try /api/shopify/connect (used by settings page)
      const res2 = await fetch('/api/shopify/connect');
      const data2 = await res2.json();

      if (data2.stores?.length > 0) {
        const s = data2.stores.find((st: any) => st.is_active || st.isActive) || data2.stores[0];
        setConnected(true);
        setStore({
          id: s.id,
          shopDomain: s.domain || s.shop_domain,
          shopName: s.name || s.shop_name,
          shopEmail: s.email || s.shop_email || '',
          currency: s.currency || 'BRL',
          planName: s.plan_name || '',
          apiVersion: s.api_version || '2026-01',
          status: s.status || s.connectionStatus || 'active',
          initialSyncCompleted: s.initial_sync_completed || false,
          pixelInstalled: s.pixel_installed || false,
          embedInstalled: s.embed_installed || false,
          installedAt: s.installed_at || '',
          lastSyncAt: s.lastSyncAt || s.last_sync_at || '',
          totalOrders: s.totalOrders || s.total_orders || 0,
          totalRevenue: s.totalRevenue || s.total_revenue || 0,
          totalCustomers: s.totalCustomers || s.total_customers || 0,
        });
        return;
      }

      setConnected(false);
      setStore(null);
    } catch {
      console.error('Failed to fetch shopify status');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    const domain = shopDomain.trim();
    if (!domain) { setError('Digite o domínio da sua loja'); return; }

    setConnecting(true);
    setError('');

    try {
      const fullDomain = domain.includes('.myshopify.com') ? domain : `${domain}.myshopify.com`;
      const res = await fetch(`/api/integrations/shopify/auth?shop=${encodeURIComponent(fullDomain)}`);
      const data = await res.json();

      if (data.error) { setError(data.error); setConnecting(false); return; }

      window.location.href = data.authUrl;
    } catch {
      setError('Erro ao conectar. Tente novamente.');
      setConnecting(false);
    }
  }

  async function handleSyncAll() {
    setSyncingAll(true);
    setError('');
    try {
      const res = await fetch('/api/shopify/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncType: 'all' }),
      });
      const data = await res.json();
      if (data.success || data.data) {
        setSuccessMessage(`Sync concluído: ${data.data?.customers || 0} clientes, ${data.data?.products || 0} produtos, ${data.data?.orders || 0} pedidos`);
        fetchStatus();
      } else {
        setError(data.error || 'Erro no sync');
      }
    } catch {
      setError('Erro ao sincronizar');
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Tem certeza? Os dados já importados serão mantidos.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/integrations/shopify/disconnect', { method: 'POST' });
      setConnected(false);
      setStore(null);
      setSuccessMessage('Loja desconectada.');
    } catch {
      setError('Erro ao desconectar');
    } finally {
      setDisconnecting(false);
    }
  }

  function getErrorMessage(code: string): string {
    const m: Record<string, string> = {
      invalid_state: 'Sessão expirada. Tente conectar novamente.',
      oauth_denied: 'Instalação cancelada.',
      missing_params: 'Parâmetros inválidos. Tente novamente.',
      token_failed: 'Falha ao obter token.',
      save_failed: 'Falha ao salvar. Tente novamente.',
      hmac_invalid: 'Validação de segurança falhou.',
      no_organization: 'Organização não encontrada. Faça login novamente.',
    };
    return m[code] || `Erro: ${code}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ============================================
  // CONNECTED — Status Panel
  // ============================================
  if (connected && store) {
    return (
      <div className="space-y-6">
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMessage}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
              <Image src="/integrations/icone shopify .png" alt="Shopify" width={24} height={24} className="object-contain" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{store.shopName}</h3>
              <p className="text-sm text-gray-500">{store.shopDomain}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
            <Wifi className="w-3 h-3" /> Conectada
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoBox label="Pedidos" value={String(store.totalOrders)} />
          <InfoBox label="Clientes" value={String(store.totalCustomers)} />
          <InfoBox label="Moeda" value={store.currency || 'BRL'} />
          <InfoBox label="Conectada em" value={store.installedAt ? new Date(store.installedAt).toLocaleDateString('pt-BR') : '-'} />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Status</h4>
          <StatusLine label="Webhooks" ok={true} detail="17 registrados" />
          <StatusLine label="Sync inicial" ok={!!store.initialSyncCompleted} detail={store.initialSyncCompleted ? 'Completo' : 'Pendente'} />
          <StatusLine label="Pixel" ok={!!store.pixelInstalled} detail={store.pixelInstalled ? 'Instalado' : 'Pendente'} />
          <StatusLine label="App Embed" ok={!!store.embedInstalled} detail={store.embedInstalled ? 'Ativo' : 'Ativar no tema'} />
          <StatusLine label="Última sync" ok={true} detail={store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleString('pt-BR') : 'Nunca'} />
          <StatusLine label="API" ok={true} detail={store.apiVersion || '2026-01'} />
        </div>

        {!store.embedInstalled && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-medium mb-1">Ativar Tracking no Tema</p>
            <ol className="list-decimal list-inside space-y-0.5 text-amber-700 text-xs">
              <li>Loja Online &rarr; Temas &rarr; Personalizar</li>
              <li>App Embeds (icone quebra-cabeça) &rarr; Ativar &quot;Worder Tracking&quot;</li>
              <li>Salvar</li>
            </ol>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-emerald-300 rounded-lg hover:bg-emerald-50 text-emerald-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncingAll ? 'animate-spin' : ''}`} />
            {syncingAll ? 'Sincronizando...' : 'Sync Clientes & Produtos'}
          </button>
          <a
            href={`https://${store.shopDomain}/admin`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <ExternalLink className="w-4 h-4" /> Shopify Admin
          </a>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-red-200 rounded-lg hover:bg-red-50 text-red-600 ml-auto"
          >
            {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Desconectar
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // DISCONNECTED — OAuth Connect Form
  // ============================================
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-[#95BF47]/10 rounded-2xl flex items-center justify-center mx-auto">
          <ShoppingBag className="w-7 h-7 text-[#95BF47]" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Conecte sua loja Shopify</h3>
        <p className="text-sm text-gray-500">Sincronize pedidos, clientes e ative tracking completo</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Domínio da loja</label>
        <div className="flex">
          <input
            type="text"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="minhaloja"
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-l-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            autoFocus
          />
          <span className="px-4 py-2.5 bg-gray-50 border border-l-0 border-gray-300 rounded-r-lg text-gray-500 text-sm flex items-center">
            .myshopify.com
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Shopify Admin &rarr; Configurações &rarr; Domínios</p>
      </div>

      <button
        onClick={handleConnect}
        disabled={connecting || !shopDomain.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#95BF47] text-white rounded-lg hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
      >
        {connecting ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Redirecionando para Shopify...</>
        ) : (
          <><ShoppingBag className="w-5 h-5" /> Conectar Loja Shopify</>
        )}
      </button>

      <div className="text-xs text-gray-400 space-y-0.5 pt-1">
        <p className="font-medium text-gray-500 mb-1">O que será sincronizado:</p>
        <p>&#10003; Pedidos e status em tempo real</p>
        <p>&#10003; Clientes e dados de contato</p>
        <p>&#10003; Carrinhos abandonados</p>
        <p>&#10003; Catálogo de produtos</p>
        <p>&#10003; Tracking comportamental</p>
        <p>&#10003; Código de rastreio e entregas</p>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function StatusLine({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-300'}`} />
        {label}
      </span>
      <span className={ok ? 'text-emerald-600 font-medium' : 'text-gray-500'}>{detail}</span>
    </div>
  );
}

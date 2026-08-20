'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useStoreStore } from '@/stores';
import {
  ShoppingBag, CheckCircle, AlertCircle, Loader2, Trash2,
  Store, ExternalLink, Wifi, RefreshCw, KeyRound,
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
  connectionType?: 'oauth' | 'manual';
  tokenExpiresAt?: string;
  initialSyncCompleted: boolean;
  pixelInstalled: boolean;
  embedInstalled: boolean;
  loaderInstalled?: boolean;
  scopes?: string[];
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
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [mode, setMode] = useState<'official' | 'manual'>('manual');
  const [manualDomain, setManualDomain] = useState('');
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');
  const [manualConnecting, setManualConnecting] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);
  const [pixelCode, setPixelCode] = useState<string | null>(null);
  const [copiedPixel, setCopiedPixel] = useState(false);
  const [showPixelCode, setShowPixelCode] = useState(false);
  const [loadingPixelCode, setLoadingPixelCode] = useState(false);

  // Edit credentials (manual integration only)
  const [showEditCreds, setShowEditCreds] = useState(false);
  const [editClientId, setEditClientId] = useState('');
  const [editClientSecret, setEditClientSecret] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  // Swap Shopify backend (manual integration only) — point the SAME
  // Worder store row at a DIFFERENT Shopify shop, preserving every
  // related record (contacts, events, automations, financials, emails).
  const [showSwap, setShowSwap] = useState(false);
  const [swapDomain, setSwapDomain] = useState('');
  const [swapClientId, setSwapClientId] = useState('');
  const [swapClientSecret, setSwapClientSecret] = useState('');
  const [swapping, setSwapping] = useState(false);

  // Disconnected stores in this org — surfaced on the connect form so
  // the merchant can REACTIVATE an existing row with a new Shopify
  // backend instead of creating a fresh row that orphans all data.
  const [disconnectedStores, setDisconnectedStores] = useState<Array<{
    id: string
    shop_domain: string
    shop_name: string | null
    currency: string | null
    plan_name: string | null
    connection_type: string | null
    status: string | null
    uninstalled_at: string | null
    installed_at: string | null
    last_sync_at: string | null
    preserved_data: { contacts: number; automations: number; events: number; orders: number }
  }>>([])
  // Which disconnected store is being reactivated (storeId) and the
  // creds being typed for it.
  const [reactivatingStoreId, setReactivatingStoreId] = useState<string | null>(null)
  const [reactivateDomain, setReactivateDomain] = useState('')
  const [reactivateClientId, setReactivateClientId] = useState('')
  const [reactivateClientSecret, setReactivateClientSecret] = useState('')
  const [reactivating, setReactivating] = useState(false)

  // When the page was opened via "Adicionar loja" from the integrations
  // list, the URL carries ?add=1. In that case we skip the "connected"
  // view even if there's already a store — the user explicitly wants
  // to connect a new one (e.g. a second Shopify store on the same org).
  const forceAdd = searchParams.get('add') === '1' || searchParams.get('add') === 'true';

  useEffect(() => {
    if (forceAdd) {
      // Skip status fetch — go straight to the connect form.
      setLoading(false);
      setConnected(false);
      return;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function fetchStatus() {
    try {
      setLoading(true);

      // Status endpoint is the canonical source — it filters by store_id
      // when present and respects is_active. We DO NOT fall back to
      // /api/shopify/connect which returns "any active store in the org":
      // that picked the wrong store when the merchant disconnects one of
      // multiple stores (e.g. disconnect sourosa, get lojalaclode shown
      // as 'connected' because it's the only active row left).
      const storeParam = currentStore?.id ? `?store_id=${currentStore.id}` : '';
      const res = await fetch(`/api/integrations/shopify/status${storeParam}`);
      const data = await res.json();

      if (data.connected && data.store) {
        setConnected(true);
        setStore(data.store);
        return;
      }

      // Not connected for the selected store — show the connect/reactivate form.
      setConnected(false);
      setStore(null);
    } catch {
      console.error('Failed to fetch shopify status');
      setConnected(false);
      setStore(null);
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

  async function handleManualConnect() {
    const domain = manualDomain.trim();
    if (!domain || !manualClientId.trim() || !manualClientSecret.trim()) {
      setError('Preencha domínio, Client ID e Client Secret.');
      return;
    }
    setManualConnecting(true);
    setError('');
    setManualResult(null);
    setPixelCode(null);

    try {
      const res = await fetch('/api/integrations/shopify/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          clientId: manualClientId.trim(),
          clientSecret: manualClientSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        let errorMsg = data.error || 'Erro ao conectar loja.';
        if (data.missingScopes && Array.isArray(data.missingScopes) && data.missingScopes.length > 0) {
          errorMsg = `Permissões obrigatórias ausentes: ${data.missingScopes.join(', ')}. Configure os escopos no Shopify Dev Dashboard e reinstale o app.`;
        }
        setError(errorMsg);
        return;
      }
      setManualResult(data);
      // Fetch the ready-to-paste Custom Pixel JS for this shop.
      try {
        const pRes = await fetch(
          `/api/integrations/shopify/pixel-code?shop=${encodeURIComponent(data.store?.domain || domain)}`
        );
        const pJson = await pRes.json();
        if (pRes.ok && pJson.code) setPixelCode(pJson.code);
      } catch { /* non-blocking */ }

      // Kick off install-extras + sync in background. The merchant
      // doesn't wait — both run server-side detached. The wizard +
      // diagnostic dashboard show progress as webhooks register and
      // products/orders stream in.
      const sId = data.store?.id;
      if (sId) {
        startPostConnectCascade(sId);
        setSuccessMessage(`Conectada! Registrando webhooks, pixel e importando dados em segundo plano. Aguarde alguns minutos pra ver tudo no diagnóstico.`);
      }

      // Land on install-pixel — manual integrations usually lack the
      // write_pixels scope so the merchant has to paste the Custom Pixel
      // snippet themselves. The wizard guides that step.
      try {
        if (sId && typeof window !== 'undefined') {
          setTimeout(() => {
            window.location.href = `/integrations/shopify/install-pixel?storeId=${sId}`;
          }, 1500);
        }
      } catch { /* fall back to manual exit via "Voltar" */ }
    } catch {
      setError('Erro ao conectar. Tente novamente.');
    } finally {
      setManualConnecting(false);
    }
  }

  // OAuth com app próprio (authorization code). Serve o modelo agência:
  // o client_credentials da conexão manual exige app e loja na MESMA
  // organização Shopify (shop_not_permitted quando não são); o OAuth
  // funciona entre organizações e devolve token que não expira. O app
  // precisa ter a Redirect URL {origin}/api/integrations/shopify/
  // oauth-manual/callback cadastrada no Dev Dashboard.
  async function startManualOAuth(opts: {
    domain: string;
    clientId: string;
    clientSecret: string;
    storeId?: string;
  }) {
    if (!opts.domain.trim() || !opts.clientId.trim() || !opts.clientSecret.trim()) {
      setError('Preencha domínio, Client ID e Client Secret.');
      return;
    }
    setOauthConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/shopify/oauth-manual/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: opts.domain.trim(),
          clientId: opts.clientId.trim(),
          clientSecret: opts.clientSecret.trim(),
          storeId: opts.storeId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Erro ao iniciar a autorização OAuth.');
        setOauthConnecting(false);
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setError('Erro ao conectar. Tente novamente.');
      setOauthConnecting(false);
    }
  }

  async function fetchPixelCode() {
    if (!store?.shopDomain) return;
    setLoadingPixelCode(true);
    try {
      const res = await fetch(`/api/integrations/shopify/pixel-code?shop=${encodeURIComponent(store.shopDomain)}`);
      const data = await res.json();
      if (res.ok && data.code) {
        setPixelCode(data.code);
        setShowPixelCode(true);
      } else {
        setError('Não foi possível gerar o código do pixel.');
      }
    } catch {
      setError('Erro ao buscar código do pixel.');
    } finally {
      setLoadingPixelCode(false);
    }
  }

  async function handleUpdateCredentials() {
    if (!store?.id) return;
    const cid = editClientId.trim();
    const cs = editClientSecret.trim();
    if (!cid || !cs) {
      setError('Preencha Client ID e Client Secret.');
      return;
    }
    setSavingCreds(true);
    setError('');
    setSuccessMessage('');
    try {
      const res = await fetch('/api/integrations/shopify/manual/update-credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, clientId: cid, clientSecret: cs }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Erro ao atualizar credenciais.');
        return;
      }
      setSuccessMessage('Credenciais atualizadas. Novo token gerado.');
      setShowEditCreds(false);
      setEditClientId('');
      setEditClientSecret('');
      fetchStatus();
    } catch {
      setError('Erro ao atualizar credenciais. Tente novamente.');
    } finally {
      setSavingCreds(false);
    }
  }

  // Fetch disconnected stores so we can offer reactivation paths.
  // Runs whenever the form is shown (i.e. not connected).
  useEffect(() => {
    if (loading || (connected && store)) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/integrations/shopify/disconnected-stores')
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled) setDisconnectedStores(j.stores || [])
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [loading, connected, store])

  // Kick off the post-connect cascade in the BACKGROUND:
  //   1. install-extras (webhooks, Custom Pixel, loader, tracker)
  //   2. sync-now       (products, customers, orders, refunds)
  //
  // Both fire-and-forget — the merchant doesn't wait. The diagnostic
  // dashboard (/tracking-debug) auto-refreshes every 5s and shows
  // webhooks appearing, pixel install status flipping, contact_events
  // streaming in. That's better feedback than blocking the connect
  // button for 30+ seconds while everything runs serially.
  function startPostConnectCascade(storeId: string) {
    fetch('/api/shopify/install-extras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId }),
      keepalive: true,
    }).then(() => {}, () => {})

    fetch('/api/shopify/sync-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // First-time connect: pull the whole order backlog, not just the
      // last 90 days. Without historical=true the merchant would land
      // with a partial dataset (e.g. 360 of 627 orders) and assume the
      // integration is broken.
      body: JSON.stringify({ storeId, syncType: 'all', historical: true }),
      keepalive: true,
    }).then(() => {}, () => {})
  }

  async function handleReactivate(storeId: string) {
    const domain = reactivateDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    const cid = reactivateClientId.trim()
    const cs = reactivateClientSecret.trim()
    if (!domain || !cid || !cs) {
      setError('Preencha domínio, Client ID e Client Secret da nova Shopify.')
      return
    }
    const fullDomain = domain.endsWith('.myshopify.com') ? domain : `${domain}.myshopify.com`
    setReactivating(true)
    setError('')
    setSuccessMessage('')
    try {
      const res = await fetch('/api/integrations/shopify/swap-backend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          newDomain: fullDomain,
          clientId: cid,
          clientSecret: cs,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Falha ao reativar loja.')
        return
      }
      const finalDomain = data.store?.shop_domain || fullDomain
      setSuccessMessage(`Conectada em ${finalDomain}! Registrando webhooks, pixel e importando dados em segundo plano. Acompanhe o progresso no diagnóstico.`)
      setReactivatingStoreId(null)
      setReactivateDomain('')
      setReactivateClientId('')
      setReactivateClientSecret('')

      // Kick off install-extras + sync in background. The merchant can
      // navigate freely — both run server-side without blocking.
      startPostConnectCascade(storeId)

      // Quick redirect to the diagnostic so progress is visible.
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = `/integrations/shopify/tracking-debug`
        }
      }, 1200)
    } catch {
      setError('Erro ao reativar. Tente novamente.')
    } finally {
      setReactivating(false)
    }
  }

  async function handleSwapBackend() {
    if (!store?.id) return;
    const domain = swapDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const cid = swapClientId.trim();
    const cs = swapClientSecret.trim();
    if (!domain || !cid || !cs) {
      setError('Preencha domínio, Client ID e Client Secret da nova Shopify.');
      return;
    }
    const fullDomain = domain.endsWith('.myshopify.com') ? domain : `${domain}.myshopify.com`;
    if (!confirm(`Trocar backend pra "${fullDomain}"?\n\nTodos os dados da Worder (contatos, eventos, automações, fluxos, emails, financeiro) ficam preservados. Apenas a Shopify de origem muda.\n\nWebhooks, pixel, loader e tracker são registrados automaticamente. A importação inicial de produtos/pedidos/clientes inicia em segundo plano.`)) return;
    setSwapping(true);
    setError('');
    setSuccessMessage('');
    try {
      const res = await fetch('/api/integrations/shopify/swap-backend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          newDomain: fullDomain,
          clientId: cid,
          clientSecret: cs,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Falha ao trocar Shopify.');
        return;
      }
      const finalDomain = data.store?.shop_domain || fullDomain;
      setSuccessMessage(`Shopify trocada pra ${finalDomain}! Webhooks, pixel e importação rodando em segundo plano. Acompanhe no diagnóstico.`);
      setShowSwap(false);
      setSwapDomain('');
      setSwapClientId('');
      setSwapClientSecret('');

      // Fire-and-forget cascade — install-extras + sync run server-side
      // without blocking the merchant. Diagnostic dashboard streams progress.
      startPostConnectCascade(store.id);

      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = `/integrations/shopify/tracking-debug`;
        }
      }, 1200);
    } catch {
      setError('Erro ao trocar Shopify. Tente novamente.');
    } finally {
      setSwapping(false);
    }
  }

  async function handleDisconnect() {
    if (!store?.id) return;
    if (!confirm(`Desconectar ${store.shopName || store.shopDomain}?\n\nDados ficam preservados (contatos, fluxos, automações, financeiro). Você pode reativar com a mesma Shopify ou outra depois.`)) return;
    setDisconnecting(true);
    try {
      // Send the SPECIFIC store id — without it the disconnect endpoint
      // deactivates EVERY active store in the org, which is catastrophic
      // when the merchant has multiple stores and only wanted to disconnect
      // one (the cause of "I disconnected sourosa but it broke lojalaclode too").
      await fetch('/api/integrations/shopify/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id }),
      });
      setConnected(false);
      setStore(null);
      setSuccessMessage('Loja desconectada. Os dados foram preservados — reative quando quiser.');
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
      domain_conflict: 'Outra loja ATIVA desta organização já usa esse domínio Shopify. Mescle ou desative a duplicada antes de conectar.',
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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
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
          <StatusLine label="Tipo de conexão" ok={true} detail={store.connectionType === 'manual' ? 'Manual (Custom App)' : 'OAuth (App Oficial)'} />
          <StatusLine label="Webhooks" ok={true} detail="17 registrados" />
          <StatusLine label="Sync inicial" ok={!!store.initialSyncCompleted} detail={store.initialSyncCompleted ? 'Completo' : 'Pendente'} />
          <StatusLine label="Pixel" ok={!!store.pixelInstalled} detail={store.pixelInstalled ? 'Instalado' : 'Pendente'} />
          {store.connectionType !== 'manual' && (
            <StatusLine label="App Embed" ok={!!store.embedInstalled} detail={store.embedInstalled ? 'Ativo' : 'Ativar no tema'} />
          )}
          <StatusLine label="Última sync" ok={true} detail={store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleString('pt-BR') : 'Nunca'} />
          <StatusLine label="API" ok={true} detail={store.apiVersion || '2026-04'} />
          {store.connectionType === 'manual' && store.tokenExpiresAt && (
            <StatusLine label="Token expira" ok={new Date(store.tokenExpiresAt) > new Date()} detail={new Date(store.tokenExpiresAt).toLocaleString('pt-BR')} />
          )}
        </div>

        {!store.pixelInstalled && !showPixelCode && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-amber-800 text-sm">Custom Pixel não instalado</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  O pixel captura visualizações de produto, carrinho, checkout e email. Sem ele, o tracking comportamental não funciona.
                </p>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-1.5">
                <a
                  href={`/integrations/shopify/install-pixel?storeId=${store.id}`}
                  className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  Instalar agora
                </a>
                <button
                  onClick={fetchPixelCode}
                  disabled={loadingPixelCode}
                  className="px-3 py-1 text-amber-700 text-[11px] font-medium hover:text-amber-900 transition-colors"
                >
                  {loadingPixelCode ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Só ver código'}
                </button>
              </div>
            </div>
          </div>
        )}

        {store.pixelInstalled && !showPixelCode && (
          <button
            onClick={fetchPixelCode}
            disabled={loadingPixelCode}
            className="text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
          >
            {loadingPixelCode ? 'Carregando...' : 'Ver código do Custom Pixel'}
          </button>
        )}

        {showPixelCode && pixelCode && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium text-gray-900 text-sm">Código do Custom Pixel</p>
              <button onClick={() => setShowPixelCode(false)} className="text-xs text-gray-400 hover:text-gray-600">
                Fechar
              </button>
            </div>
            <div className="relative">
              <pre className="bg-white p-3 rounded border border-gray-200 text-[11px] font-mono overflow-x-auto text-gray-800 max-h-56 overflow-y-auto">
                {pixelCode}
              </pre>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pixelCode);
                    setCopiedPixel(true);
                    setTimeout(() => setCopiedPixel(false), 2000);
                  } catch {}
                }}
                className="absolute top-2 right-2 px-2.5 py-1 bg-brand-500 text-white rounded text-xs font-medium hover:bg-brand-600 transition-colors"
              >
                {copiedPixel ? '✓ Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">Como instalar:</p>
              <p>1. No admin Shopify, vá em <strong>Configurações → Customer Events</strong></p>
              <p>2. Clique em <strong>Adicionar pixel personalizado</strong></p>
              <p>3. Nome: <strong>Worder</strong></p>
              <p>4. Cole o código acima no editor</p>
              <p>5. Em &ldquo;Privacidade do cliente&rdquo;, selecione <strong>Não obrigatório</strong></p>
              <p>6. Clique <strong>Salvar</strong> e depois <strong>Conectar</strong></p>
            </div>
          </div>
        )}

        {/* OAuth: ask the merchant to enable our App Embed in Theme Editor */}
        {store.connectionType !== 'manual' && !store.embedInstalled && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-medium mb-1">Ativar Tracking no Tema</p>
            <ol className="list-decimal list-inside space-y-0.5 text-amber-700 text-xs">
              <li>Loja Online &rarr; Temas &rarr; Personalizar</li>
              <li>App Embeds (icone quebra-cabeça) &rarr; Ativar &quot;Worder Tracking&quot;</li>
              <li>Salvar</li>
            </ol>
          </div>
        )}

        {/* Manual storefront popup loader.
            Three states for manual integrations:
              1. loaderInstalled = true (auto-installed via ScriptTag) →
                 show a green "Popups ativos" confirmation, no action needed.
              2. write_script_tags scope missing → show how to add the scope.
              3. Scope present but install failed → show manual paste fallback. */}
        {store.connectionType === 'manual' && store.loaderInstalled && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-emerald-800">Popups instalados na loja</p>
              <p className="text-[11px] text-emerald-700/80 mt-0.5">
                O loader é injetado automaticamente em todas as páginas via Shopify ScriptTag — sem precisar editar o tema.
              </p>
            </div>
          </div>
        )}

        {store.connectionType === 'manual' && !store.loaderInstalled && !(store.scopes || []).includes('write_script_tags') && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="font-medium text-amber-900 text-sm mb-2">Ative a instalação automática de popups</p>
            <p className="text-xs text-amber-800 mb-2 leading-relaxed">
              Para a Worder injetar os popups na sua loja sozinha (sem você editar o tema), adicione o escopo <code className="px-1 py-0.5 bg-white rounded font-mono text-[11px]">write_script_tags</code> ao seu Custom App no Shopify Dev Dashboard.
            </p>
            <div className="text-[11px] text-amber-800 space-y-0.5">
              <p>1. Dev Dashboard &rarr; seu app &rarr; <strong>Configurações</strong> &rarr; Escopos do Admin API</p>
              <p>2. Adicione <code className="font-mono">write_script_tags</code> e salve</p>
              <p>3. <strong>Reinstale o app</strong> na loja</p>
              <p>4. Volte aqui e clique <strong>Sincronizar Tudo</strong> — a Worder instalará o loader automaticamente</p>
            </div>
          </div>
        )}

        {store.connectionType === 'manual' && !store.loaderInstalled && (store.scopes || []).includes('write_script_tags') && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="font-medium text-amber-900 text-sm mb-2">Loader não pôde ser instalado automaticamente</p>
            <p className="text-xs text-amber-800 mb-2.5 leading-relaxed">
              Como fallback, cole este script no <code className="px-1 py-0.5 bg-white rounded font-mono text-[11px]">theme.liquid</code> antes de <code className="px-1 py-0.5 bg-white rounded font-mono text-[11px]">&lt;/body&gt;</code>.
            </p>
            <div className="relative">
              <pre className="bg-white p-3 rounded border border-amber-200 text-[11px] font-mono overflow-x-auto text-gray-800">{`<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://app.worder.com.br'}/api/storefront/loader.js" async></script>`}</pre>
              <button
                onClick={async () => {
                  try {
                    const snippet = `<script src="${window.location.origin}/api/storefront/loader.js" async></script>`;
                    await navigator.clipboard.writeText(snippet);
                    setSuccessMessage('Script copiado.');
                    setTimeout(() => setSuccessMessage(''), 2000);
                  } catch {}
                }}
                className="absolute top-2 right-2 px-2.5 py-1 bg-amber-700 text-white rounded text-[11px] font-medium hover:bg-amber-800 transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>
        )}

        {store.connectionType === 'manual' && showSwap && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-blue-900 text-sm">Trocar pra outra Shopify</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Aponta esta loja Worder pra um Shopify <strong>diferente</strong>, preservando todos os dados (contatos, eventos, automações, fluxos, emails, financeiro). Domínio atual: <code className="font-mono">{store.shopDomain}</code>.
                </p>
              </div>
              <button
                onClick={() => { setShowSwap(false); setSwapDomain(''); setSwapClientId(''); setSwapClientSecret(''); setError(''); }}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                Cancelar
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-900 mb-1">Domínio da nova loja</label>
              <input
                type="text"
                value={swapDomain}
                onChange={(e) => setSwapDomain(e.target.value)}
                placeholder="novalojanew.myshopify.com"
                className="w-full px-3 py-2 border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-900 mb-1">Client ID (novo Custom App)</label>
              <input
                type="text"
                value={swapClientId}
                onChange={(e) => setSwapClientId(e.target.value)}
                placeholder="Dev Dashboard → novo app → Client ID"
                className="w-full px-3 py-2 border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-900 mb-1">Client Secret (novo Custom App)</label>
              <input
                type="password"
                value={swapClientSecret}
                onChange={(e) => setSwapClientSecret(e.target.value)}
                placeholder="Dev Dashboard → novo app → Client Secret"
                className="w-full px-3 py-2 border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                autoComplete="off"
              />
            </div>
            <div className="text-[11px] text-blue-700 bg-blue-100/50 px-3 py-2 rounded leading-relaxed">
              <strong>O que muda:</strong> domínio, access token, shop_id, currency, plan_name, scopes.
              <br />
              <strong>O que fica:</strong> contatos, eventos, automações, fluxos, emails, segmentos, financeiro, deals, atividades.
              <br />
              <strong>Próximo passo:</strong> após salvar, você é redirecionado pro diagnóstico onde precisa clicar em <strong>Reinstalar tudo</strong> pra registrar webhooks na Shopify nova.
            </div>
            <button
              onClick={handleSwapBackend}
              disabled={swapping || !swapDomain.trim() || !swapClientId.trim() || !swapClientSecret.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {swapping ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Validando e trocando…</>
              ) : (
                <>Trocar Shopify (preserva todos os dados)</>
              )}
            </button>
          </div>
        )}

        {store.connectionType === 'manual' && showEditCreds && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Atualizar credenciais</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cole o novo Client ID e Client Secret do seu Custom App. O domínio <code className="font-mono">{store.shopDomain}</code> não muda.
                </p>
              </div>
              <button
                onClick={() => { setShowEditCreds(false); setEditClientId(''); setEditClientSecret(''); setError(''); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancelar
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Client ID</label>
              <input
                type="text"
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                placeholder="Dev Dashboard → seu app → Client ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] outline-none"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Client Secret</label>
              <input
                type="password"
                value={editClientSecret}
                onChange={(e) => setEditClientSecret(e.target.value)}
                placeholder="Dev Dashboard → seu app → Client Secret"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] outline-none"
                autoComplete="off"
              />
            </div>
            <button
              onClick={handleUpdateCredentials}
              disabled={savingCreds || !editClientId.trim() || !editClientSecret.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#95BF47] text-white rounded-lg hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {savingCreds ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Validando e salvando...</>
              ) : (
                <>Salvar e gerar novo token</>
              )}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
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
          <a
            href="/integrations/shopify/tracking-debug"
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            title="Ver eventos de tracking em tempo real"
          >
            <Wifi className="w-4 h-4" /> Diagnóstico
          </a>
          {store.connectionType === 'manual' && (
            <button
              onClick={() => { setShowEditCreds((v) => !v); setShowSwap(false); }}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              <KeyRound className="w-4 h-4" />
              {showEditCreds ? 'Fechar editor' : 'Editar credenciais'}
            </button>
          )}
          {store.connectionType === 'manual' && (
            <button
              onClick={() => { setShowSwap((v) => !v); setShowEditCreds(false); }}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-blue-200 rounded-lg hover:bg-blue-50 text-blue-700"
              title="Aponta esta loja pra outra Shopify mantendo todos os dados"
            >
              <RefreshCw className="w-4 h-4" />
              {showSwap ? 'Fechar' : 'Trocar Shopify'}
            </button>
          )}
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

      {/* Disconnected stores — offer reactivation INTO the existing row.
          Surfaces only when there's data worth preserving (contacts/events/
          automations) and crucially BEFORE the new-store form so the
          merchant doesn't accidentally create a duplicate row by typing
          into the form below. */}
      {disconnectedStores.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-200">
            <p className="text-[13px] font-semibold text-blue-900">
              {disconnectedStores.length === 1 ? 'Loja desativada com dados preservados' : `${disconnectedStores.length} lojas desativadas com dados preservados`}
            </p>
            <p className="text-[11.5px] text-blue-700 mt-0.5 leading-relaxed">
              Em vez de criar uma loja nova (perdendo contatos, fluxos, automações, financeiro), reative a existente com uma <strong>nova Shopify</strong> — pode ser a mesma loja Shopify ou outra. Tudo o que você já tem na Worder fica.
            </p>
          </div>
          <div className="divide-y divide-blue-100">
            {disconnectedStores.map((s) => {
              const isExpanded = reactivatingStoreId === s.id
              const totalRecords = s.preserved_data.contacts + s.preserved_data.events + s.preserved_data.automations + s.preserved_data.orders
              return (
                <div key={s.id} className="bg-white">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">
                        {s.shop_name || s.shop_domain || 'Loja sem nome'}
                      </p>
                      <p className="text-[11px] text-gray-500 font-mono truncate">
                        {s.shop_domain}
                      </p>
                      <p className="text-[10.5px] text-gray-500 mt-0.5">
                        Dados preservados:{' '}
                        <span className="font-semibold text-gray-700">{s.preserved_data.contacts}</span> contatos ·{' '}
                        <span className="font-semibold text-gray-700">{s.preserved_data.events}</span> eventos ·{' '}
                        <span className="font-semibold text-gray-700">{s.preserved_data.automations}</span> automações ·{' '}
                        <span className="font-semibold text-gray-700">{s.preserved_data.orders}</span> pedidos
                        {totalRecords === 0 && <span className="ml-1 text-amber-600">(loja sem histórico — pode ser mais limpo conectar nova)</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (isExpanded) {
                          setReactivatingStoreId(null)
                          setReactivateDomain('')
                          setReactivateClientId('')
                          setReactivateClientSecret('')
                        } else {
                          setReactivatingStoreId(s.id)
                          setReactivateDomain(s.shop_domain || '')
                          setReactivateClientId('')
                          setReactivateClientSecret('')
                          setError('')
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex-shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {isExpanded ? 'Cancelar' : 'Reativar'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 bg-blue-50/50 border-t border-blue-100 pt-3">
                      <p className="text-[11.5px] text-blue-800 leading-relaxed">
                        Cole as credenciais da Shopify pra qual quer apontar esta loja. Pode ser a <strong>mesma de antes</strong> (recuperando a integração) ou uma <strong>nova Shopify</strong>. Os {s.preserved_data.contacts + s.preserved_data.events} registros da Worder ficam preservados em qualquer caso.
                      </p>
                      <div>
                        <label className="block text-[11px] font-medium text-blue-900 mb-1">Domínio da Shopify</label>
                        <input
                          type="text"
                          value={reactivateDomain}
                          onChange={(e) => setReactivateDomain(e.target.value)}
                          placeholder="loja.myshopify.com"
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-blue-900 mb-1">Client ID</label>
                        <input
                          type="text"
                          value={reactivateClientId}
                          onChange={(e) => setReactivateClientId(e.target.value)}
                          placeholder="Dev Dashboard → Custom App → Client ID"
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-blue-900 mb-1">Client Secret</label>
                        <input
                          type="password"
                          value={reactivateClientSecret}
                          onChange={(e) => setReactivateClientSecret(e.target.value)}
                          placeholder="Dev Dashboard → Custom App → Client Secret"
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        onClick={() => handleReactivate(s.id)}
                        disabled={reactivating || oauthConnecting || !reactivateDomain.trim() || !reactivateClientId.trim() || !reactivateClientSecret.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                      >
                        {reactivating ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Validando e reativando…</>
                        ) : (
                          <>Reativar com esta Shopify</>
                        )}
                      </button>
                      <button
                        onClick={() => startManualOAuth({
                          domain: reactivateDomain,
                          clientId: reactivateClientId,
                          clientSecret: reactivateClientSecret,
                          storeId: s.id,
                        })}
                        disabled={reactivating || oauthConnecting || !reactivateDomain.trim() || !reactivateClientId.trim() || !reactivateClientSecret.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 bg-white rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed text-[13px] font-medium transition-colors"
                        title="Use quando o app foi criado em outra organização Shopify (shop_not_permitted no botão acima). Requer a Redirect URL do OAuth cadastrada no app."
                      >
                        {oauthConnecting ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Redirecionando…</>
                        ) : (
                          <>Reativar via OAuth (app de outra organização)</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Connection mode tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
        <button
          onClick={() => setMode('official')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'official' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Integração Oficial
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Integração Manual
        </button>
      </div>

      {mode === 'official' ? (
        <>
          <p className="text-xs text-gray-500 -mt-2">
            Conexão automática via OAuth. Requer que o app Worder esteja aprovado na Shopify.
          </p>
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
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500 -mt-2">
            Crie um app no <a href="https://dev.shopify.com" target="_blank" rel="noreferrer" className="text-[#95BF47] hover:underline">Shopify Dev Dashboard</a>,
            configure os escopos, instale na loja e cole aqui o Client ID + Client Secret.
            A Worder gera o access token automaticamente via <code className="text-[11px] px-1 py-0.5 bg-gray-100 rounded">client_credentials</code>.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Domínio da loja</label>
            <input
              type="text"
              value={manualDomain}
              onChange={(e) => setManualDomain(e.target.value.trim().toLowerCase())}
              placeholder="minhaloja.myshopify.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Client ID</label>
            <input
              type="text"
              value={manualClientId}
              onChange={(e) => setManualClientId(e.target.value)}
              placeholder="copiado do Dev Dashboard"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] outline-none"
              autoComplete="off"
            />
            <p className="text-xs text-gray-400 mt-1">Dev Dashboard → seu app → Configurações → ID do cliente</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Client Secret</label>
            <input
              type="password"
              value={manualClientSecret}
              onChange={(e) => setManualClientSecret(e.target.value)}
              placeholder="copiada do Dev Dashboard"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] outline-none"
              autoComplete="off"
            />
            <p className="text-xs text-gray-400 mt-1">
              A Worder gera o access token a partir do Client Secret e renova automaticamente a cada 24h.
            </p>
          </div>

          {/* Error repeated here on purpose: the page-top banner sits
              above the fold when the merchant is down at this button,
              so a failed connect looked like "clicked and nothing
              happened". */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            onClick={handleManualConnect}
            disabled={manualConnecting || oauthConnecting || !manualDomain.trim() || !manualClientId.trim() || !manualClientSecret.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#95BF47] text-white rounded-lg hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {manualConnecting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Conectando...</>
            ) : (
              <>Conectar Loja</>
            )}
          </button>

          {/* App criado em OUTRA organização Shopify (modelo agência):
              client_credentials devolve shop_not_permitted — o caminho é
              OAuth com o mesmo Client ID/Secret. */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <p className="text-[11.5px] text-blue-800 leading-relaxed">
              <strong>App criado em outra organização</strong> (ex.: agência conectando a loja de um cliente)?
              O botão acima retorna <code className="font-mono text-[10.5px]">shop_not_permitted</code>.
              Use OAuth: cadastre a Redirect URL abaixo nas configurações do app no Dev Dashboard e clique em conectar —
              quem estiver logado na loja só precisa autorizar a instalação.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[10.5px] bg-white border border-blue-200 rounded px-2 py-1.5 text-gray-800 break-all font-mono">
                {(typeof window !== 'undefined' ? window.location.origin : '')}/api/integrations/shopify/oauth-manual/callback
              </code>
              <button
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(`${window.location.origin}/api/integrations/shopify/oauth-manual/callback`);
                  } catch { /* noop */ }
                }}
                className="px-2 py-1.5 bg-blue-100 text-blue-700 text-xs font-medium rounded hover:bg-blue-200 flex-shrink-0"
              >
                Copiar
              </button>
            </div>
            <button
              onClick={() => startManualOAuth({ domain: manualDomain, clientId: manualClientId, clientSecret: manualClientSecret })}
              disabled={oauthConnecting || manualConnecting || !manualDomain.trim() || !manualClientId.trim() || !manualClientSecret.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {oauthConnecting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Redirecionando para autorização…</>
              ) : (
                <>Conectar via OAuth (app de outra organização)</>
              )}
            </button>
          </div>

          {manualResult && (
            <div className="space-y-4 pt-4">
              {/* Success banner */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800">Loja conectada com sucesso!</p>
                  <p className="text-sm text-emerald-700 mt-0.5">
                    {manualResult.store?.name || 'Sua loja'} está pronta. {pixelCode ? 'Instale o Custom Pixel abaixo para tracking completo.' : 'Todos os eventos serão sincronizados em tempo real.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-3">
                <StatusLine label="Loja conectada" ok detail={manualResult.store?.name || '—'} />
              <StatusLine
                label="Token de acesso"
                ok={!!manualResult.token?.obtained}
                detail={manualResult.token?.obtained ? 'Gerado (renovação automática a cada 24h)' : '—'}
              />
              <StatusLine
                label="Webhooks"
                ok={(manualResult.webhooks?.created || 0) + (manualResult.webhooks?.existing || 0) > 0}
                detail={
                  manualResult.webhooks?.manualSetupRequired
                    ? 'Configuração manual necessária (ver abaixo)'
                    : `${(manualResult.webhooks?.created || 0) + (manualResult.webhooks?.existing || 0)} / ${manualResult.webhooks?.total}`
                }
              />
              <StatusLine label="Sync inicial" ok={!!manualResult.sync?.triggered} detail={manualResult.sync?.triggered ? 'Disparado' : '—'} />
              <StatusLine
                label="Custom Pixel"
                ok={!!manualResult.pixel?.autoInstalled}
                detail={manualResult.pixel?.autoInstalled ? 'Instalado automaticamente' : 'Use o código abaixo'}
              />
              </div>

              {/* Missing recommended scopes warning */}
              {manualResult.missingRecommendedScopes && manualResult.missingRecommendedScopes.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="font-medium text-amber-800 text-sm mb-2">
                    Permissões recomendadas ausentes
                  </p>
                  <p className="text-xs text-amber-700 mb-2">
                    Sua loja vai funcionar, mas algumas funcionalidades estarão limitadas. Adicione estas permissões ao seu Custom App no Shopify Dev Dashboard para suporte completo:
                  </p>
                  <div className="space-y-1">
                    {manualResult.missingRecommendedScopes.map((scope: string) => {
                      const labels: Record<string, string> = {
                        'read_all_orders': 'Pedidos antigos (>60 dias) — sem isto, só puxa últimos 60 dias',
                        'write_pixels': 'Auto-instalar pixel — sem isto, precisa colar código manualmente',
                        'read_customer_events': 'Eventos do cliente para attribution',
                        'read_fulfillments': 'Status de entrega/rastreamento',
                        'read_discounts': 'Cupons e descontos para automações',
                      };
                      return (
                        <div key={scope} className="flex items-start gap-2 text-xs">
                          <code className="font-mono bg-white border border-amber-200 rounded px-1.5 py-0.5 text-amber-900 flex-shrink-0">{scope}</code>
                          <span className="text-amber-700">{labels[scope] || ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Webhook manual setup instructions */}
              {manualResult.webhooks?.failed > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                  <p className="font-medium text-amber-800 text-sm mb-2">
                    {manualResult.webhooks.manualSetupRequired
                      ? 'Webhooks precisam ser configurados manualmente'
                      : `${manualResult.webhooks.failed} webhook(s) falharam — configure manualmente:`}
                  </p>
                  <div className="mb-3">
                    <p className="text-xs text-amber-700 font-medium mb-1">URL do webhook (copiar):</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] bg-white border border-amber-200 rounded px-2 py-1.5 text-gray-800 break-all font-mono">
                        {manualResult.webhooks.webhookUrl}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(manualResult.webhooks.webhookUrl).catch(() => {})}
                        className="px-2 py-1.5 bg-amber-100 text-amber-700 text-xs font-medium rounded hover:bg-amber-200 flex-shrink-0"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-amber-700 space-y-1">
                    <p className="font-medium">Como configurar:</p>
                    <p>1. No Dev Dashboard → seu app → <strong>Webhooks</strong></p>
                    <p>2. Adicione a URL acima como <strong>Endpoint URL</strong></p>
                    <p>3. Selecione os tópicos:</p>
                    <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] font-mono bg-white/60 rounded p-2">
                      {(manualResult.webhooks.failedTopics || [
                        'orders/create', 'orders/updated', 'orders/paid',
                        'checkouts/create', 'checkouts/update',
                        'customers/create', 'customers/update',
                        'products/create', 'products/update',
                      ]).map((t: string) => (
                        <span key={t} className="text-amber-800">{t}</span>
                      ))}
                    </div>
                    <p className="mt-2">4. Formato: <strong>JSON</strong></p>
                    <p>5. API version: <strong>2026-01</strong></p>
                  </div>
                </div>
              )}
            </div>
          )}

          {pixelCode && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mt-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 text-sm">
                    Instale o Custom Pixel da Worder
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Captura visualizações de produto, carrinho e checkout (inclusive e-mail no checkout).
                  </p>
                </div>
              </div>

              <div className="relative">
                <pre className="bg-white p-3 rounded border border-amber-200 text-[11px] font-mono overflow-x-auto text-gray-800 max-h-48">
                  {pixelCode}
                </pre>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(pixelCode);
                      setCopiedPixel(true);
                      setTimeout(() => setCopiedPixel(false), 1800);
                    } catch { /* noop */ }
                  }}
                  className="absolute top-2 right-2 px-2 py-1 bg-amber-100 rounded hover:bg-amber-200 transition-colors text-xs font-medium text-amber-700"
                >
                  {copiedPixel ? 'Copiado!' : 'Copiar'}
                </button>
              </div>

              <div className="mt-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">Como instalar:</p>
                <p>1. Admin Shopify → <strong>Configurações → Customer Events</strong></p>
                <p>2. Clique em <strong>Adicionar pixel personalizado</strong></p>
                <p>3. Nome: <strong>Worder</strong></p>
                <p>4. Cole o código acima no editor</p>
                <p>5. <strong>Salvar</strong> → <strong>Conectar</strong></p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Done button — appears after successful connection */}
      {manualResult && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Ir para o Dashboard
          </button>
          <button
            onClick={() => window.location.href = '/integrations'}
            className="px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Integrações
          </button>
        </div>
      )}

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

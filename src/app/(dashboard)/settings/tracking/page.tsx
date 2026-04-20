'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Globe,
  Code2,
  Puzzle,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShopifyStatus {
  connected: boolean;
  store?: {
    shop_domain?: string;
    pixel_installed?: boolean;
    embed_installed?: boolean;
  };
}

interface EventSummary {
  event_type: string;
  count: number;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        ok
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-gray-50 text-gray-500 border border-gray-200'
      )}
    >
      {ok ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <XCircle className="w-3.5 h-3.5" />
      )}
      {label}
    </span>
  );
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  page_viewed: 'Visualizou Pagina',
  viewed_product: 'Visualizou Produto',
  added_to_cart: 'Adicionou ao Carrinho',
  removed_from_cart: 'Removeu do Carrinho',
  checkout_started: 'Iniciou Checkout',
  checkout_completed: 'Completou Checkout',
  active_on_site: 'Ativo no Site',
  viewed_collection: 'Visualizou Colecao',
  submitted_search: 'Pesquisou',
  cart_viewed: 'Visualizou Carrinho',
  checkout_contact_submitted: 'Contato no Checkout',
  payment_submitted: 'Pagamento Enviado',
  placed_order: 'Pedido Realizado',
};

export default function TrackingSettingsPage() {
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null);
  const [eventSummary, setEventSummary] = useState<EventSummary[]>([]);
  const [totalEvents24h, setTotalEvents24h] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchData() {
    try {
      const [statusRes, metricsRes] = await Promise.all([
        fetch('/api/integrations/shopify/status'),
        fetch('/api/analytics/metrics?period=24h&group_by=event_type'),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setShopifyStatus(data);
      }

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        const events: EventSummary[] = data.event_summary || data.events || [];
        setEventSummary(events);
        setTotalEvents24h(events.reduce((sum: number, e: EventSummary) => sum + e.count, 0));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchData();
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const isConnected = shopifyStatus?.connected ?? false;
  const storeDomain = shopifyStatus?.store?.shop_domain;
  const pixelInstalled = shopifyStatus?.store?.pixel_installed ?? false;
  const embedInstalled = shopifyStatus?.store?.embed_installed ?? false;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rastreamento</h1>
        <p className="text-gray-500 mt-1">
          Monitore o status do rastreamento e os eventos recentes da sua loja.
        </p>
      </div>

      <div className="space-y-6">
        {/* Connection Status Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Activity className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Status do Rastreamento</h2>
          </div>

          <div className="space-y-4">
            {/* Store Connection */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Loja Conectada</p>
                  {storeDomain && (
                    <p className="text-xs text-gray-500 mt-0.5">{storeDomain}</p>
                  )}
                </div>
              </div>
              <StatusBadge
                ok={isConnected}
                label={isConnected ? 'Conectada' : 'Desconectada'}
              />
            </div>

            {/* Web Pixel */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Code2 className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Web Pixel</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Rastreia eventos de checkout e carrinho.
                  </p>
                </div>
              </div>
              <StatusBadge
                ok={pixelInstalled}
                label={pixelInstalled ? 'Instalado' : 'Nao Instalado'}
              />
            </div>

            {/* Theme Extension */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Puzzle className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Extensao do Tema</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Rastreia navegacao e visualizacao de produtos.
                  </p>
                </div>
              </div>
              <StatusBadge
                ok={embedInstalled}
                label={embedInstalled ? 'Ativo' : 'Inativo'}
              />
            </div>
          </div>

          {/* Warning if not fully set up */}
          {isConnected && (!pixelInstalled || !embedInstalled) && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">
                {!pixelInstalled && !embedInstalled
                  ? 'O Web Pixel e a Extensao do Tema nao estao instalados. Instale ambos para rastreamento completo.'
                  : !pixelInstalled
                    ? 'O Web Pixel nao esta instalado. Eventos de checkout e carrinho nao serao rastreados.'
                    : 'A Extensao do Tema nao esta ativa. Eventos de navegacao nao serao rastreados.'}
              </p>
            </div>
          )}

          {!isConnected && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">
                Nenhuma loja Shopify conectada. Conecte sua loja em Integracoes para ativar o rastreamento.
              </p>
            </div>
          )}
        </div>

        {/* Recent Events Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 rounded-lg">
                <BarChart3 className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Eventos Recentes</h2>
                <p className="text-xs text-gray-500 mt-0.5">Ultimas 24 horas</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              title="Atualizar"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
          </div>

          {totalEvents24h > 0 ? (
            <>
              <div className="mb-4 p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-3xl font-bold text-gray-900">{totalEvents24h.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-gray-500 mt-1">eventos nas ultimas 24h</p>
              </div>

              <div className="space-y-2">
                {eventSummary
                  .sort((a, b) => b.count - a.count)
                  .map((event) => (
                    <div
                      key={event.event_type}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-700">
                        {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                      </span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums">
                        {event.count.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nenhum evento registrado nas ultimas 24 horas.</p>
              {!isConnected && (
                <p className="text-xs text-gray-400 mt-1">
                  Conecte sua loja para comecar a receber eventos.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

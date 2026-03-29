'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Play, DollarSign, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.27 8.27 0 004.84 1.55V6.79a4.85 4.85 0 01-1.07-.1z" />
    </svg>
  );
}

export default function TikTokAdsPage() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/integrations/tiktok');
        if (res.ok) {
          const data = await res.json();
          setConnected(!!data.connected || !!data.accounts?.length);
        }
      } catch {}
      setLoading(false);
    }
    check();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Verificando conexão...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">TikTok Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie campanhas e acompanhe métricas do TikTok Ads
          </p>
        </div>
        {connected && (
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        )}
      </div>

      {!connected ? (
        /* Not connected state */
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TikTokIcon className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Conecte o TikTok Ads</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Conecte sua conta do TikTok Ads para acompanhar métricas de campanhas de vídeo, CPM,
            engajamento e conversões diretamente no Worder.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => (window.location.href = '/integrations/tiktok')}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Conectar TikTok Ads
            </button>
            <a
              href="https://ads.tiktok.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir TikTok Ads Manager
            </a>
          </div>

          {/* Feature preview */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            {[
              { icon: Play, label: 'Métricas de Vídeo', desc: 'Views e taxa de conclusão' },
              { icon: TrendingUp, label: 'Engajamento', desc: 'Curtidas, comentários e shares' },
              { icon: BarChart3, label: 'CPM e CPV', desc: 'Custo por mil e por view' },
              { icon: DollarSign, label: 'Conversões', desc: 'ROI e custo por conversão' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-4">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center mb-3 shadow-sm">
                  <Icon className="w-4 h-4 text-orange-500" />
                </div>
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Connected state */
        <div className="space-y-4">
          {/* Status banner */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full flex-shrink-0" />
            <span className="text-sm font-medium text-green-700">TikTok Ads conectado</span>
            <a
              href="/integrations/tiktok"
              className="ml-auto text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              Gerenciar conexão
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Metrics placeholder */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Impressões', value: '—', sub: 'Últimos 30 dias' },
              { label: 'Views de Vídeo', value: '—', sub: 'Últimos 30 dias' },
              { label: 'CPM Médio', value: '—', sub: 'Últimos 30 dias' },
              { label: 'Conversões', value: '—', sub: 'Últimos 30 dias' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-2xl font-semibold text-gray-900">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Os dados das campanhas serão exibidos aqui assim que a sincronização for concluída.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

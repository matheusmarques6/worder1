'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

export default function FacebookAdsPage() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/integrations/meta');
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
          <h1 className="text-2xl font-semibold text-gray-900">Facebook Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie suas campanhas e acompanhe métricas do Facebook Ads
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
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
              <circle cx="12" cy="12" r="12" fill="#1877F2" />
              <path
                fill="white"
                d="M16.5 12.5h-2.5v8h-3v-8h-2v-2.5h2v-1.5c0-2.5 1-4 3.5-4h2.5v2.5h-1.5c-1 0-1.5.5-1.5 1.5v1.5h3l-.5 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Conecte o Facebook Ads</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Conecte sua conta do Facebook Ads para acompanhar métricas de campanhas, ROAS e
            conversões diretamente no Worder.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => (window.location.href = '/integrations/meta')}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Conectar Facebook Ads
            </button>
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Facebook Business
            </a>
          </div>

          {/* Feature preview */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            {[
              { icon: BarChart3, label: 'Métricas de Campanhas', desc: 'Impressões, cliques e CTR' },
              { icon: TrendingUp, label: 'ROAS em Tempo Real', desc: 'Retorno sobre investimento' },
              { icon: Users, label: 'Audiências', desc: 'Segmentação e alcance' },
              { icon: DollarSign, label: 'Gastos e Orçamento', desc: 'Controle de custos' },
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
            <span className="text-sm font-medium text-green-700">Facebook Ads conectado</span>
            <a
              href="/integrations/meta"
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
              { label: 'Cliques', value: '—', sub: 'Últimos 30 dias' },
              { label: 'Gasto Total', value: '—', sub: 'Últimos 30 dias' },
              { label: 'ROAS', value: '—', sub: 'Últimos 30 dias' },
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

'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, MousePointerClick, DollarSign, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function GoogleAdsPage() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/integrations/google-ads');
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
          <h1 className="text-2xl font-semibold text-gray-900">Google Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie campanhas e acompanhe métricas do Google Ads
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
          <div className="w-16 h-16 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GoogleIcon className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Conecte o Google Ads</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Conecte sua conta do Google Ads para acompanhar métricas de campanhas, Quality Score,
            CPC e conversões diretamente no Worder.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => (window.location.href = '/integrations/google-ads')}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Conectar Google Ads
            </button>
            <a
              href="https://ads.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Google Ads
            </a>
          </div>

          {/* Feature preview */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            {[
              { icon: BarChart3, label: 'Performance de Campanhas', desc: 'Impressões e cliques' },
              { icon: TrendingUp, label: 'Quality Score', desc: 'Pontuação de qualidade' },
              { icon: MousePointerClick, label: 'CPC Médio', desc: 'Custo por clique' },
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
            <span className="text-sm font-medium text-green-700">Google Ads conectado</span>
            <a
              href="/integrations/google-ads"
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
              { label: 'CPC Médio', value: '—', sub: 'Últimos 30 dias' },
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

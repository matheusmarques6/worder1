'use client';

import { useState, useEffect } from 'react';
import { Activity, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrackingSettings {
  track_opens: boolean;
  track_clicks: boolean;
  track_anonymous: boolean;
  facebook_pixel_id: string;
  google_analytics_id: string;
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2',
        enabled ? 'bg-orange-500' : 'bg-gray-200'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          enabled ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

export default function TrackingSettingsPage() {
  const [settings, setSettings] = useState<TrackingSettings>({
    track_opens: true,
    track_clicks: true,
    track_anonymous: false,
    facebook_pixel_id: '',
    google_analytics_id: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings/tracking');
        if (res.ok) {
          const data = await res.json();
          setSettings(prev => ({ ...prev, ...data }));
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const res = await fetch('/api/settings/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus('idle'), 3000);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rastreamento</h1>
        <p className="text-gray-500 mt-1">Configure como suas campanhas rastreiam interações.</p>
      </div>

      <div className="space-y-6">
        {/* Toggle settings */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Activity className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Opções de Rastreamento</h2>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Rastrear Aberturas</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Registra quando um destinatário abre o e-mail.
                </p>
              </div>
              <Toggle
                enabled={settings.track_opens}
                onChange={val => setSettings(s => ({ ...s, track_opens: val }))}
              />
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Rastrear Cliques</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Registra quando um destinatário clica em links do e-mail.
                </p>
              </div>
              <Toggle
                enabled={settings.track_clicks}
                onChange={val => setSettings(s => ({ ...s, track_clicks: val }))}
              />
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Rastrear Visitantes Anônimos</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Coleta dados de visitantes que ainda não estão identificados.
                </p>
              </div>
              <Toggle
                enabled={settings.track_anonymous}
                onChange={val => setSettings(s => ({ ...s, track_anonymous: val }))}
              />
            </div>
          </div>
        </div>

        {/* Pixel & Analytics IDs */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Integrações de Analytics</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Facebook Pixel ID
              </label>
              <input
                type="text"
                value={settings.facebook_pixel_id}
                onChange={e => setSettings(s => ({ ...s, facebook_pixel_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="123456789012345"
              />
              <p className="text-xs text-gray-400 mt-1">
                Encontre no Gerenciador de Eventos do Facebook.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Google Analytics ID
              </label>
              <input
                type="text"
                value={settings.google_analytics_id}
                onChange={e => setSettings(s => ({ ...s, google_analytics_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="G-XXXXXXXXXX ou UA-XXXXXX-X"
              />
              <p className="text-xs text-gray-400 mt-1">
                ID da propriedade GA4 ou Universal Analytics.
              </p>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Configurações
          </button>
          {status === 'success' && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" /> Salvo!
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-sm text-red-500">
              <AlertCircle className="w-4 h-4" /> Erro ao salvar
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

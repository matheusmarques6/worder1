'use client';

import { useState, useEffect } from 'react';
import { Link2, Save, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface AttributionSettings {
  email_window_days: number;
  whatsapp_window_days: number;
  sms_window_days: number;
}

export default function AttributionSettingsPage() {
  const [settings, setSettings] = useState<AttributionSettings>({
    email_window_days: 5,
    whatsapp_window_days: 2,
    sms_window_days: 2,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings/attribution');
        if (res.ok) {
          const data = await res.json();
          setSettings((prev: AttributionSettings) => ({ ...prev, ...data }));
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
      const res = await fetch('/api/settings/attribution', {
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
        <h1 className="text-2xl font-bold text-gray-900">Atribuição</h1>
        <p className="text-gray-500 mt-1">
          Configure as janelas de atribuição por canal para medir conversões corretamente.
        </p>
      </div>

      <div className="space-y-6">
        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            A janela de atribuição define por quantos dias uma conversão é creditada ao canal que
            gerou o último contato antes da compra. Janelas maiores atribuem mais conversões; janelas
            menores são mais conservadoras.
          </p>
        </div>

        {/* Attribution windows */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Link2 className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Janelas de Atribuição</h2>
          </div>

          <div className="space-y-5">
            {/* Email */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">E-mail</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Janela padrão de 5 dias (recomendado para e-commerce).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={settings.email_window_days}
                  onChange={e =>
                    setSettings(s => ({ ...s, email_window_days: Number(e.target.value) }))
                  }
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? 'dia' : 'dias'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">WhatsApp</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Conversas tendem a converter mais rápido; janela mais curta é adequada.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={settings.whatsapp_window_days}
                  onChange={e =>
                    setSettings(s => ({ ...s, whatsapp_window_days: Number(e.target.value) }))
                  }
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  {[1, 2, 3].map(d => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? 'dia' : 'dias'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">SMS</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  SMS geralmente convertem em poucas horas após o envio.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={settings.sms_window_days}
                  onChange={e =>
                    setSettings(s => ({ ...s, sms_window_days: Number(e.target.value) }))
                  }
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  {[1, 2, 3].map(d => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? 'dia' : 'dias'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resumo</p>
          <ul className="space-y-1 text-sm text-gray-600">
            <li>
              E-mail:{' '}
              <span className="font-medium text-gray-900">
                {settings.email_window_days} {settings.email_window_days === 1 ? 'dia' : 'dias'}
              </span>
            </li>
            <li>
              WhatsApp:{' '}
              <span className="font-medium text-gray-900">
                {settings.whatsapp_window_days}{' '}
                {settings.whatsapp_window_days === 1 ? 'dia' : 'dias'}
              </span>
            </li>
            <li>
              SMS:{' '}
              <span className="font-medium text-gray-900">
                {settings.sms_window_days} {settings.sms_window_days === 1 ? 'dia' : 'dias'}
              </span>
            </li>
          </ul>
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

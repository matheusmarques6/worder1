'use client';

import { useState, useEffect } from 'react';
import { Link2, Save, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface AttributionSettings {
  email_window_days: number;
  whatsapp_window_days: number;
  sms_window_days: number;
  // Klaviyo/Omnisend-style toggles. count_opens controls whether
  // opens (in addition to clicks) qualify as engagement for the
  // attribution window. exclude_mpp_opens hides Apple Mail Privacy
  // Protection auto-opens (pre-fetched the moment the email is
  // delivered) from both reporting and attribution — matches
  // Klaviyo's default.
  count_opens: boolean;
  exclude_mpp_opens: boolean;
}

const DEFAULTS: AttributionSettings = {
  email_window_days: 5,
  whatsapp_window_days: 2,
  sms_window_days: 2,
  count_opens: true,
  exclude_mpp_opens: true,
};

// Aligned with Klaviyo (31 days max) and Omnisend (30 days max). We
// cap at 30 across all channels so the per-channel logic stays
// symmetric.
const WINDOW_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30];

export default function AttributionSettingsPage() {
  const [settings, setSettings] = useState<AttributionSettings>(DEFAULTS);
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
            menores são mais conservadoras. <strong>Última interação ganha</strong> — modelo last-touch
            por canal, igual ao Klaviyo e Omnisend.
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
                  Padrão de 5 dias. Klaviyo recomenda 5–7, Omnisend usa 7.
                </p>
              </div>
              <select
                value={settings.email_window_days}
                onChange={e =>
                  setSettings(s => ({ ...s, email_window_days: Number(e.target.value) }))
                }
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                {WINDOW_OPTIONS.map(d => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'dia' : 'dias'}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">WhatsApp</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Conversas convertem rápido; janela curta (2–3 dias) é o sweet spot.
                </p>
              </div>
              <select
                value={settings.whatsapp_window_days}
                onChange={e =>
                  setSettings(s => ({ ...s, whatsapp_window_days: Number(e.target.value) }))
                }
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                {WINDOW_OPTIONS.map(d => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'dia' : 'dias'}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">SMS</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  SMS convertem em horas; Klaviyo usa 5 dias, Omnisend 24h.
                </p>
              </div>
              <select
                value={settings.sms_window_days}
                onChange={e =>
                  setSettings(s => ({ ...s, sms_window_days: Number(e.target.value) }))
                }
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                {WINDOW_OPTIONS.map(d => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'dia' : 'dias'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Engagement signals */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Info className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Sinais de Engajamento</h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.count_opens}
                onChange={e => setSettings(s => ({ ...s, count_opens: e.target.checked }))}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Contar aberturas para atribuição</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Quando desligado, só cliques entram na janela. Útil pra negócios onde abertura
                  não é um sinal forte (transacional, B2B).
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.exclude_mpp_opens}
                onChange={e =>
                  setSettings(s => ({ ...s, exclude_mpp_opens: e.target.checked }))
                }
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Excluir aberturas falsas do Apple MPP
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Apple Mail Privacy Protection pré-carrega imagens assim que o email é entregue —
                  isso registra uma "abertura" falsa que não corresponde a engajamento real. Quando
                  marcado, essas aberturas ficam separadas (em <code>mpp_opened_at</code>) e não
                  qualificam pra atribuição. Klaviyo aplica esse filtro por padrão.
                </p>
              </div>
            </label>
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
            <li>
              Engajamento:{' '}
              <span className="font-medium text-gray-900">
                {settings.count_opens ? 'aberturas + cliques' : 'somente cliques'}
                {settings.count_opens && settings.exclude_mpp_opens ? ' (MPP excluído)' : ''}
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

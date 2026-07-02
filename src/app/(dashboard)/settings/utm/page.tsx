'use client';

import { useState, useEffect } from 'react';
import { Link2, Save, Loader2, Eye } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';

export default function UTMSettingsPage() {
  const toast = useToast();
  const [utmSource, setUtmSource] = useState('worder');
  const [utmMedium, setUtmMedium] = useState('email');
  const [autoAdd, setAutoAdd] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/organization');
        if (res.ok) {
          const data = await res.json();
          const settings = data.organization?.email_settings || {};
          if (settings.utm_source) setUtmSource(settings.utm_source);
          if (settings.utm_medium) setUtmMedium(settings.utm_medium);
          if (settings.utm_auto_add !== undefined) setAutoAdd(settings.utm_auto_add);
        }
      } catch {}
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_settings: { utm_source: utmSource, utm_medium: utmMedium, utm_auto_add: autoAdd },
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        toast.error('Erro ao salvar', 'Não foi possível salvar os parâmetros UTM. Tente novamente.');
      }
    } catch {
      toast.error('Erro ao salvar', 'Não foi possível salvar os parâmetros UTM. Tente novamente.');
    }
    setSaving(false);
  };

  const previewUrl = `https://sualoja.com.br/produto?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}&utm_campaign=nome-campanha`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Parâmetros UTM</h1>
        <p className="text-sm text-gray-500 mt-1">Configure os parâmetros UTM padrão para rastreamento de links</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Adicionar UTMs automaticamente</h3>
            <p className="text-xs text-gray-500 mt-1">Adicionar parâmetros UTM a todos os links em emails e mensagens</p>
          </div>
          <button
            onClick={() => setAutoAdd(!autoAdd)}
            className={`relative w-11 h-6 rounded-full transition-colors ${autoAdd ? 'bg-orange-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoAdd ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">utm_source</label>
          <input
            type="text"
            value={utmSource}
            onChange={e => setUtmSource(e.target.value)}
            placeholder="worder"
            className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
          <p className="text-xs text-gray-500 mt-1">Identifica a plataforma de onde vem o tráfego</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">utm_medium</label>
          <input
            type="text"
            value={utmMedium}
            onChange={e => setUtmMedium(e.target.value)}
            placeholder="email"
            className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
          <p className="text-xs text-gray-500 mt-1">Identifica o tipo de canal (email, whatsapp, sms)</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Preview do URL</span>
          </div>
          <p className="text-xs text-gray-600 break-all font-mono bg-white rounded p-3 border border-gray-200">
            {previewUrl}
          </p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

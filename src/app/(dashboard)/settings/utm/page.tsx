'use client';

// =============================================
// Configurações → UTM
//
// Rastreamento de links no modelo Omnisend/Klaviyo: TODO link enviado
// (e-mail, SMS, WhatsApp) sai com as seis UTMs montadas por template com
// variáveis ({{campaign_name}}, {{automation_name}}, {{message_name}}…)
// e com os parâmetros de identificação do contato/envio, que o pixel da
// loja lê para atribuir as vendas. Configuração POR LOJA; sem loja
// selecionada, edita o padrão da organização.
// =============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Save, Loader2, Eye, Plus, Trash2, RotateCcw, Braces, ShieldCheck, Store } from 'lucide-react';
import { useStoreStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';
import {
  DEFAULT_UTM_SETTINGS,
  IDENT_PARAM_KEYS,
  MAX_CUSTOM_PARAMS,
  UTM_KEYS,
  UTM_VARIABLES,
  isValidCustomParamKey,
  makeLinkParamsResolver,
  normalizeUtmSettings,
  sampleLinkContext,
  type LinkChannel,
  type LinkMessageType,
  type UtmKey,
  type UtmSettings,
  type UtmVariable,
} from '@/lib/tracking/link-params';

type Source = 'store' | 'org' | 'legacy' | 'default';

const PARAM_HELP: Record<UtmKey, { title: string; help: string }> = {
  utm_source: { title: 'utm_source', help: 'De onde veio o tráfego. Padrão: worder.' },
  utm_medium: { title: 'utm_medium', help: 'O canal. {{channel}} vira email, sms ou whatsapp sozinho.' },
  utm_campaign: { title: 'utm_campaign', help: 'A campanha ou automação. Padrão: "campaign: Nome (id)" / "automation: Nome (id)".' },
  utm_content: { title: 'utm_content', help: 'Diferencia a mensagem/link. Padrão: id da campanha ou "Email 1 (id do nó)".' },
  utm_term: { title: 'utm_term', help: 'Livre. Padrão: data do envio ({{send_date}}).' },
  utm_id: { title: 'utm_id', help: 'ID da campanha para o GA4. Padrão: id da campanha/automação.' },
};

const IDENT_HELP: Record<(typeof IDENT_PARAM_KEYS)[number], string> = {
  worderContactID: 'Contato que recebeu — o pixel identifica o visitante mesmo em outro dispositivo.',
  worderSendID: 'O envio exato — atribui a venda ao e-mail/SMS/WhatsApp certo.',
  worderCampaignID: 'A campanha (envios de campanha).',
  worderAutomationID: 'A automação (envios de fluxo).',
  worderMessageID: 'A mensagem: id da campanha ou do nó do fluxo.',
};

function sourceLabel(source: Source, hasStore: boolean) {
  if (source === 'store') return 'Configuração desta loja';
  if (source === 'org') return hasStore ? 'Herdando o padrão da organização' : 'Padrão da organização';
  if (source === 'legacy') return 'Padrão antigo da organização (utm_source/utm_medium)';
  return 'Padrão Worder';
}

export default function UTMSettingsPage() {
  const toast = useToast();
  const { currentStore } = useStoreStore();
  const hasHydrated = useStoreStore((s) => s._hasHydrated);
  const storeId = currentStore?.id || null;

  const [settings, setSettings] = useState<UtmSettings>(DEFAULT_UTM_SETTINGS);
  const [source, setSource] = useState<Source>('default');
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<LinkMessageType>('campaign');
  const [previewChannel, setPreviewChannel] = useState<LinkChannel>('email');

  useEffect(() => {
    if (!hasHydrated) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
        const res = await fetch(`/api/settings/utm${qs}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('load');
        const data = await res.json();
        if (cancelled) return;
        setSettings(normalizeUtmSettings(data.settings));
        setSource(data.source || 'default');
        setStoreName(data.store?.name || null);
        setDirty(false);
      } catch {
        if (!cancelled) toast.error('Erro ao carregar', 'Não foi possível carregar a configuração de UTM.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, hasHydrated]);

  const update = (fn: (s: UtmSettings) => UtmSettings) => {
    setSettings((prev) => fn(prev));
    setDirty(true);
  };

  const setTemplate = (scope: LinkMessageType, key: UtmKey, value: string) =>
    update((s) => ({ ...s, [scope]: { ...s[scope], [key]: value } }));

  const handleSave = async () => {
    const badCustom = settings.custom.find((c) => !isValidCustomParamKey(c.key));
    if (badCustom) {
      toast.error('Nome inválido', `"${badCustom.key}" não pode ser usado como parâmetro. Use letras, números, _ ou -.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/utm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('Erro ao salvar', data?.error || 'Não foi possível salvar os parâmetros UTM.');
        return;
      }
      setSettings(normalizeUtmSettings(data.settings));
      setSource(data.source || (storeId ? 'store' : 'org'));
      setDirty(false);
      toast.success('Salvo', storeId ? 'Todos os links desta loja passam a sair com estes parâmetros.' : 'Padrão da organização atualizado.');
    } catch {
      toast.error('Erro ao salvar', 'Não foi possível salvar os parâmetros UTM.');
    } finally {
      setSaving(false);
    }
  };

  const handleInherit = async () => {
    if (!storeId) return;
    if (!confirm('Esta loja vai voltar a herdar o padrão da organização. Continuar?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/utm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, reset: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'reset');
      setSettings(normalizeUtmSettings(data.settings));
      setSource(data.source || 'default');
      setDirty(false);
      toast.success('Pronto', 'A loja voltou a herdar o padrão.');
    } catch {
      toast.error('Erro', 'Não foi possível restaurar a herança.');
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => {
    const ctx = sampleLinkContext(tab, previewChannel);
    const resolve = makeLinkParamsResolver(settings, ctx);
    const destination = 'https://sualoja.com.br/products/exemplo';
    const params = resolve({ url: destination, text: 'Comprar agora', index: 1 });
    const url = new URL(destination);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return { url: url.toString(), params };
  }, [settings, tab, previewChannel]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando configuração de UTM…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Link2 className="w-6 h-6 text-orange-500" /> Rastreamento de links (UTM)
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Todo link enviado por e-mail, SMS e WhatsApp sai com as seis UTMs abaixo e com a identificação do contato e do envio.
            Use variáveis para cada envio se rotular sozinho, como na Omnisend e na Klaviyo.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700">
            <Store className="w-3.5 h-3.5 text-gray-400" />
            {storeId ? `Loja: ${storeName || (currentStore as any)?.shop_name || (currentStore as any)?.name || 'selecionada'}` : 'Sem loja selecionada: padrão da organização'}
          </span>
          <span className={`px-2.5 py-1 rounded-full border ${source === 'store' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
            {sourceLabel(source, !!storeId)}
          </span>
        </div>
      </div>

      {/* Ligar/desligar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Adicionar UTMs automaticamente em todos os links</h3>
          <p className="text-xs text-gray-500 mt-1">
            Desligado, os links saem só com a identificação (worderContactID, worderSendID…), que nunca é removida.
            Uma UTM colocada à mão num link do editor sempre vence a automática.
          </p>
        </div>
        <button
          type="button"
          onClick={() => update((s) => ({ ...s, enabled: !s.enabled }))}
          className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${settings.enabled ? 'bg-orange-500' : 'bg-gray-300'}`}
          aria-pressed={settings.enabled}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {/* Templates por tipo de mensagem */}
      <div className={`bg-white border border-gray-200 rounded-xl ${settings.enabled ? '' : 'opacity-60'}`}>
        <div className="flex items-center gap-1 px-5 pt-4 border-b border-gray-100">
          {(['campaign', 'automation'] as LinkMessageType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'campaign' ? 'Campanhas' : 'Automações'}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400 pb-2">
            Variáveis entre chaves duplas: {'{{campaign_name}}'}, {'{{message_name}}'}, {'{{channel}}'}…
          </span>
        </div>
        <div className="p-5 space-y-4">
          {UTM_KEYS.map((key) => (
            <TemplateRow
              key={`${tab}-${key}`}
              label={PARAM_HELP[key].title}
              help={PARAM_HELP[key].help}
              value={settings[tab][key]}
              placeholder={DEFAULT_UTM_SETTINGS[tab][key] || '(vazio: não envia este parâmetro)'}
              scope={tab}
              disabled={!settings.enabled}
              onChange={(v) => setTemplate(tab, key, v)}
            />
          ))}

          {/* Personalizados */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Parâmetros personalizados</h4>
                <p className="text-xs text-gray-500">Além das UTMs padrão, até {MAX_CUSTOM_PARAMS} parâmetros próprios (ex.: utm_store, ref). Um template para campanhas e outro para automações.</p>
              </div>
              <button
                type="button"
                disabled={!settings.enabled || settings.custom.length >= MAX_CUSTOM_PARAMS}
                onClick={() => update((s) => ({ ...s, custom: [...s.custom, { key: '', campaign: '', automation: '' }] }))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
            {settings.custom.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum parâmetro personalizado.</p>
            )}
            <div className="space-y-2">
              {settings.custom.map((c, i) => {
                const invalid = c.key !== '' && !isValidCustomParamKey(c.key);
                return (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-[180px_1fr_1fr_auto] gap-2 items-start">
                    <div>
                      <input
                        type="text"
                        value={c.key}
                        disabled={!settings.enabled}
                        onChange={(e) => update((s) => ({ ...s, custom: s.custom.map((x, j) => (j === i ? { ...x, key: e.target.value.trim() } : x)) }))}
                        placeholder="nome (ex.: utm_store)"
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${invalid ? 'border-red-300' : 'border-gray-200 focus:border-orange-500'}`}
                      />
                      {invalid && <p className="text-[11px] text-red-600 mt-1">Nome inválido ou reservado.</p>}
                    </div>
                    <TemplateInput
                      value={c.campaign}
                      placeholder="template para campanhas"
                      scope="campaign"
                      disabled={!settings.enabled}
                      onChange={(v) => update((s) => ({ ...s, custom: s.custom.map((x, j) => (j === i ? { ...x, campaign: v } : x)) }))}
                    />
                    <TemplateInput
                      value={c.automation}
                      placeholder="template para automações"
                      scope="automation"
                      disabled={!settings.enabled}
                      onChange={(v) => update((s) => ({ ...s, custom: s.custom.map((x, j) => (j === i ? { ...x, automation: v } : x)) }))}
                    />
                    <button
                      type="button"
                      onClick={() => update((s) => ({ ...s, custom: s.custom.filter((_, j) => j !== i) }))}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="Remover parâmetro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-900">Como o link vai sair ({tab === 'campaign' ? 'campanha' : 'automação'})</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {(['email', 'sms', 'whatsapp'] as LinkChannel[]).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setPreviewChannel(ch)}
                className={`px-2.5 py-1 rounded-md border ${previewChannel === ch ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-700 break-all font-mono bg-gray-50 rounded-lg p-3 border border-gray-200">{preview.url}</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {Object.entries(preview.params).map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 text-xs">
              <span className={`font-mono shrink-0 ${k.startsWith('worder') ? 'text-emerald-700' : 'text-orange-700'}`}>{k}</span>
              <span className="text-gray-600 truncate">= {v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Identificação */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-medium text-gray-900">Identificação (sempre presente, não pode ser removida)</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          É o equivalente ao <span className="font-mono">_kx</span> da Klaviyo e ao <span className="font-mono">omnisendContactID</span> da Omnisend:
          o pixel instalado na loja lê estes parâmetros na chegada e amarra o visitante ao contato e ao envio, mesmo em outro dispositivo.
          Sem eles a atribuição de vendas falha; por isso vão em todo link, com ou sem UTM.
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {IDENT_PARAM_KEYS.map((k) => (
            <li key={k} className="text-xs flex items-start gap-2">
              <span className="font-mono text-emerald-700 shrink-0">{k}</span>
              <span className="text-gray-600">{IDENT_HELP[k]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {storeId ? 'Salvar para esta loja' : 'Salvar padrão da organização'}
        </button>
        <button
          type="button"
          onClick={() => update(() => DEFAULT_UTM_SETTINGS)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw className="w-4 h-4" /> Restaurar padrão Worder
        </button>
        {storeId && source === 'store' && (
          <button
            type="button"
            onClick={handleInherit}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
          >
            Voltar a herdar o padrão da organização
          </button>
        )}
        {dirty && <span className="text-xs text-amber-600">Alterações não salvas</span>}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Linha de template + seletor de variáveis (estilo Omnisend)
// -------------------------------------------------------------

function TemplateRow({
  label, help, value, placeholder, scope, disabled, onChange,
}: {
  label: string; help: string; value: string; placeholder: string; scope: LinkMessageType; disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[150px_1fr] gap-2 md:gap-4 items-start">
      <div>
        <label className="block text-sm font-mono font-medium text-gray-800">{label}</label>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{help}</p>
      </div>
      <TemplateInput value={value} placeholder={placeholder} scope={scope} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function TemplateInput({
  value, placeholder, scope, disabled, onChange,
}: {
  value: string; placeholder: string; scope: LinkMessageType; disabled?: boolean; onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const variables = useMemo(
    () => UTM_VARIABLES.filter((v) => v.scope === 'all' || v.scope === 'link' || v.scope === scope),
    [scope]
  );

  const insert = (v: UtmVariable) => {
    const tag = `{{${v.key}}}`;
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tag + value.slice(end);
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + tag.length;
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex">
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-l-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-gray-50"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 px-2.5 border border-l-0 border-gray-200 rounded-r-lg text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
          title="Inserir variável"
        >
          <Braces className="w-3.5 h-3.5" /> Variável
        </button>
      </div>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 max-h-72 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {variables.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insert(v)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-900">{v.label}</span>
                <span className="text-[11px] font-mono text-orange-700">{`{{${v.key}}}`}</span>
              </div>
              <p className="text-[11px] text-gray-500">{v.description} · ex.: {v.example}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

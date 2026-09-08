'use client'

// =============================================
// UTM da campanha — igual à seção "UTM tags" da etapa de configurações
// da Omnisend: mostra os valores que a loja aplica por padrão e deixa
// sobrescrever, campo a campo, só nesta campanha. A identificação do
// contato/envio (worderContactID, worderSendID…) nunca é removida.
// =============================================

import { useEffect, useMemo, useState } from 'react'
import { Link2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_UTM_SETTINGS,
  UTM_KEYS,
  makeLinkParamsResolver,
  normalizeUtmSettings,
  type MessageUtmConfig,
  type UtmKey,
  type UtmSettings,
} from '@/lib/tracking/link-params'

interface UtmPanelProps {
  storeId?: string | null
  campaignName: string
  subject: string
  value: MessageUtmConfig
  onChange: (cfg: MessageUtmConfig) => void
}

export default function UtmPanel({ storeId, campaignName, subject, value, onChange }: UtmPanelProps) {
  const [settings, setSettings] = useState<UtmSettings>(DEFAULT_UTM_SETTINGS)
  const [source, setSource] = useState<string>('default')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
        const r = await fetch(`/api/settings/utm${qs}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (cancelled) return
        setSettings(normalizeUtmSettings(d.settings))
        setSource(d.source || 'default')
      } catch { /* mantém o padrão Worder */ }
    })()
    return () => { cancelled = true }
  }, [storeId])

  const customizing = !!value.overrides && Object.keys(value.overrides).length > 0
  const disabled = value.disabled === true

  // Preview com os dados desta campanha (nome/assunto reais, ids de exemplo).
  const preview = useMemo(() => {
    const resolve = makeLinkParamsResolver(
      settings,
      {
        channel: 'email',
        messageType: 'campaign',
        campaignName: campaignName || 'Minha campanha',
        campaignId: 'id-da-campanha',
        emailSubject: subject || 'Assunto',
        sendId: 'id-do-envio',
        contactId: 'id-do-contato',
      },
      { utmOverrides: value.overrides || null, utmDisabled: disabled }
    )
    return resolve({ url: 'https://sualoja.com.br/products/exemplo', text: 'Comprar agora', index: 1 })
  }, [settings, campaignName, subject, value.overrides, disabled])

  const setOverride = (key: UtmKey, v: string) => {
    const next: Partial<Record<UtmKey, string>> = { ...(value.overrides || {}) }
    if (v.trim()) next[key] = v
    else delete next[key]
    onChange({ ...value, overrides: Object.keys(next).length ? next : undefined })
  }

  const utmEntries = Object.entries(preview).filter(([k]) => !k.startsWith('worder'))

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50">
          <Link2 size={16} className="text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">UTM dos links</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {disabled
              ? 'Sem UTM nesta campanha (identificação do contato/envio continua)'
              : customizing
                ? 'Personalizada nesta campanha'
                : source === 'store'
                  ? 'Padrão da loja aplicado a todos os links'
                  : 'Padrão aplicado a todos os links'}
            {!disabled && utmEntries.length > 0 && (
              <span className="text-gray-400"> · utm_campaign = {preview.utm_campaign || '—'}</span>
            )}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-gray-500">
              Todo link deste e-mail sai com as UTMs abaixo e com a identificação do contato e do envio.
              Deixe em branco para usar o padrão da loja (
              <a href="/settings/utm" target="_blank" rel="noreferrer" className="text-orange-600 underline">Configurações → UTM</a>
              ). Variáveis: {'{{campaign_name}}'}, {'{{campaign_id}}'}, {'{{email_subject}}'}, {'{{channel}}'}, {'{{send_date}}'}, {'{{link_text}}'}…
            </p>

            <div className={cn('space-y-2', disabled && 'opacity-50 pointer-events-none')}>
              {UTM_KEYS.map((key) => (
                <div key={key} className="grid grid-cols-[110px_1fr] gap-2 items-center">
                  <span className="text-[11px] font-mono text-gray-600">{key}</span>
                  <div>
                    <input
                      type="text"
                      value={value.overrides?.[key] || ''}
                      onChange={(e) => setOverride(key, e.target.value)}
                      placeholder={settings.campaign[key] ? `padrão: ${settings.campaign[key]}` : '(não enviado por padrão)'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                    />
                    {preview[key] && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">→ {preview[key]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 cursor-pointer pt-2 border-t border-gray-100">
              <input
                type="checkbox"
                checked={disabled}
                onChange={(e) => onChange({ ...value, disabled: e.target.checked || undefined })}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-xs text-gray-700">
                Não adicionar UTM nesta campanha. A identificação (worderContactID, worderSendID, worderCampaignID) continua em todo link.
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

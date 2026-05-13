// =============================================
// EmbedActivationBanner
//
// Shown above the forms / popups dashboard when the merchant's
// connected store has never phoned home from the storefront. Two paths
// reach embed-ping: the Theme App Embed (worder.js, only available on
// OAuth installs) and the Custom App loader.js (merchant pastes a
// snippet into theme.liquid — used by manual integrations). Without
// activation the popups can't render no matter what the dashboard says.
//
// States:
//   installed                       — slim green confirmation row
//   not-installed + OAuth           — App Embeds step-by-step
//   not-installed + manual          — Custom App loader.js snippet
// =============================================

'use client'

import { CheckCircle2, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { useStoreStore } from '@/stores'

interface Props {
  /** Optional override — defaults to the active store from zustand. */
  storeId?: string
  /** Hide entirely when the embed is already detected. Default: false (show
   *  a slim "tracking ativo" confirmation). */
  hideWhenInstalled?: boolean
}

export function EmbedActivationBanner({ storeId, hideWhenInstalled = false }: Props) {
  const { currentStore, stores } = useStoreStore()
  const store = storeId ? stores.find((s) => s.id === storeId) : currentStore
  const [copied, setCopied] = useState(false)

  if (!store) return null

  const installed = store.embedInstalled === true

  if (installed) {
    if (hideWhenInstalled) return null
    const when = store.embedInstalledAt
      ? new Date(store.embedInstalledAt).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : null
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="font-medium">Tracking ativo em {store.domain}</span>
        {when && <span className="text-emerald-700/80">— detectado em {when}</span>}
      </div>
    )
  }

  const isManual = (store.connectionType || 'oauth') === 'manual'
  const appUrl =
    (typeof window !== 'undefined' && window.location?.origin) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.worder.com.br'
  const snippet = `<script src="${appUrl}/api/storefront/loader.js" async></script>`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore — paste fallback shown */
    }
  }

  // ── Manual / Custom App path ──
  if (isManual) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-amber-900">
              Cole o script no tema da sua loja
            </h3>
            <p className="text-[13px] text-amber-800 mt-1">
              Como esta loja foi conectada manualmente, os popups precisam de um pequeno
              script no <strong>theme.liquid</strong> de <strong>{store.domain}</strong>{' '}
              para carregar. É só uma vez.
            </p>

            <ol className="mt-3 space-y-2 text-[13px] text-amber-900 list-decimal list-inside">
              <li>Copie o script abaixo.</li>
              <li>
                No admin da Shopify, vá em <strong>Online Store &gt; Temas &gt; Personalizar &gt; Editar código</strong>.
              </li>
              <li>
                Abra <code className="px-1 bg-amber-100 rounded text-[11px]">layout/theme.liquid</code>.
              </li>
              <li>
                Cole o script imediatamente antes de <code className="px-1 bg-amber-100 rounded text-[11px]">&lt;/body&gt;</code>.
              </li>
              <li>Clique em <strong>Salvar</strong>.</li>
            </ol>

            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2">
              <code className="flex-1 text-[12px] font-mono text-gray-700 overflow-x-auto whitespace-nowrap">
                {snippet}
              </code>
              <button
                type="button"
                onClick={copySnippet}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors shrink-0"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <p className="text-[12px] text-amber-700 mt-3">
              Depois de colar e salvar, abra qualquer página da loja em outra aba. A gente
              detecta automaticamente e o aviso some.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── OAuth / Theme App Embed path ──
  // Shopify lets the merchant land directly on the App Embed section
  // when ?context=apps is appended to the theme editor URL — same trick
  // the Shopify CLI uses.
  const themeEditorUrl = store.domain
    ? `https://admin.shopify.com/store/${store.domain.replace('.myshopify.com', '')}/themes/current/editor?context=apps`
    : null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-amber-900">
            Ative o app no tema da sua loja
          </h3>
          <p className="text-[13px] text-amber-800 mt-1">
            Seus popups não vão aparecer em <strong>{store.domain}</strong> até você
            ativar o Worder no editor de temas da Shopify. É só uma vez.
          </p>

          <ol className="mt-3 space-y-2 text-[13px] text-amber-900 list-decimal list-inside">
            <li>
              Abra o editor de tema:{' '}
              {themeEditorUrl ? (
                <a
                  href={themeEditorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
                >
                  Customize tema atual
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
                  Loja Online &gt; Temas &gt; Personalizar
                </span>
              )}
            </li>
            <li>
              No menu lateral, clique no ícone de <strong>App embeds</strong> (🧩)
            </li>
            <li>
              Encontre <strong>Worder Tracking</strong> e ligue o toggle
            </li>
            <li>
              Clique em <strong>Salvar</strong> no canto superior direito
            </li>
          </ol>

          <p className="text-[12px] text-amber-700 mt-3">
            Assim que ativar, a gente detecta automaticamente em poucos segundos. Atualize
            esta página depois e o aviso some.
          </p>
        </div>
      </div>
    </div>
  )
}

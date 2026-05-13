// =============================================
// EmbedActivationBanner
//
// Shown above the forms / popups dashboard when the merchant's
// connected store has never phoned home from the Theme App Embed.
// Shopify doesn't notify us when a merchant toggles an app embed in
// the theme editor — we infer activation from /api/storefront/embed-ping
// (worder.js sends one beacon per session). Until that lands the
// merchant's popups can't render, no matter what the dashboard says.
//
// Two states:
//   not-installed  — show step-by-step + link to the theme editor
//   installed      — show a small green confirmation row (collapsible)
// =============================================

'use client'

import { CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
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

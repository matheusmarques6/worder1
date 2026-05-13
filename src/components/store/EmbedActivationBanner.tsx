// =============================================
// EmbedActivationBanner
//
// Renders above /forms (and anywhere else useful) when the merchant's
// active store hasn't been detected on the storefront yet. The popups
// physically can't render without the loader present, so this banner
// is the only thing that closes that gap.
//
// Auto-install: clicks /api/shopify/install-extras which tries:
//   1. ScriptTag API (write_script_tags scope)
//   2. Asset API edit of layout/theme.liquid (write_themes scope)
//   3. Falls back to a copy/paste snippet ONLY when neither scope is
//      granted on the Custom App.
//
// States rendered:
//   installed                       — slim green confirmation row
//   not-installed                   — "Instalar automaticamente" CTA
//   not-installed + install failed  — surfaces missing scopes + snippet
// =============================================

'use client'

import { CheckCircle2, AlertTriangle, ExternalLink, Copy, Check, Loader2, Zap } from 'lucide-react'
import { useState } from 'react'
import { useStoreStore } from '@/stores'

interface Props {
  /** Optional override — defaults to the active store from zustand. */
  storeId?: string
  /** Hide entirely when the embed is already detected. Default: false (show
   *  a slim "tracking ativo" confirmation). */
  hideWhenInstalled?: boolean
}

type InstallState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; via: 'script_tag' | 'theme_asset' }
  | { kind: 'failed'; missingScopes: string[]; snippet: string }

export function EmbedActivationBanner({ storeId, hideWhenInstalled = false }: Props) {
  const { currentStore, stores, updateStore } = useStoreStore()
  const store = storeId ? stores.find((s) => s.id === storeId) : currentStore
  const [copied, setCopied] = useState(false)
  const [install, setInstall] = useState<InstallState>({ kind: 'idle' })

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

  // ── Just-installed feedback ──
  if (install.kind === 'success') {
    const via = install.via === 'script_tag' ? 'via ScriptTag' : 'via theme.liquid'
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="font-medium">Loader instalado em {store.domain} ({via}).</span>
        <span className="text-emerald-700/80">Recarregue a loja em outra aba para testar.</span>
      </div>
    )
  }

  const appUrl =
    (typeof window !== 'undefined' && window.location?.origin) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.worder.com.br'
  const snippet =
    install.kind === 'failed' && install.snippet
      ? install.snippet
      : `<script src="${appUrl}/api/storefront/loader.js" async></script>`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* paste fallback shown */
    }
  }

  async function autoInstall() {
    if (!store) return
    setInstall({ kind: 'running' })
    try {
      const res = await fetch('/api/shopify/install-extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id }),
      })
      const data = await res.json()
      const loader = data?.loader || {}
      if (loader.installed && loader.via) {
        // Reflect the new state into zustand so the green confirmation
        // row renders without a page reload.
        updateStore(store.id, {
          embedInstalled: true,
          embedInstalledAt: new Date().toISOString(),
        })
        setInstall({ kind: 'success', via: loader.via })
      } else {
        setInstall({
          kind: 'failed',
          missingScopes: Array.isArray(loader.missingScopes) ? loader.missingScopes : [],
          snippet:
            loader.manualFallbackSnippet ||
            `<script src="${appUrl}/api/storefront/loader.js" async></script>`,
        })
      }
    } catch (err) {
      setInstall({
        kind: 'failed',
        missingScopes: [],
        snippet: `<script src="${appUrl}/api/storefront/loader.js" async></script>`,
      })
    }
  }

  const failed = install.kind === 'failed'
  const partnerUrl = `https://admin.shopify.com/store/${(store.domain || '').replace('.myshopify.com', '')}/apps`

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-amber-900">
            {failed ? 'Não consegui instalar automaticamente' : 'Ative o tracking na sua loja'}
          </h3>
          <p className="text-[13px] text-amber-800 mt-1">
            {failed ? (
              <>
                A Worder não tem permissão pra editar o tema de <strong>{store.domain}</strong>.
                Adicione os escopos abaixo no Custom App e reinstale, ou cole o snippet manualmente.
              </>
            ) : (
              <>
                Seus popups não vão aparecer em <strong>{store.domain}</strong> até o
                loader estar carregado na loja. Posso instalar pra você.
              </>
            )}
          </p>

          {/* PRIMARY CTA — auto-install */}
          {!failed && (
            <div className="mt-3">
              <button
                type="button"
                onClick={autoInstall}
                disabled={install.kind === 'running'}
                className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold bg-amber-900 text-amber-50 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                {install.kind === 'running' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Instalando...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    Instalar automaticamente
                  </>
                )}
              </button>
              <p className="text-[11px] text-amber-700 mt-2">
                Sem copy/paste. A Worder cria um ScriptTag (ou edita o theme.liquid) usando
                o token que você já autorizou.
              </p>
            </div>
          )}

          {/* FAILURE STATE — scopes faltando + reinstall warning + snippet.
              Custom Apps pegadinha: scopes editados na configuração só
              entram em vigor depois de REINSTALAR o app na loja. Tem
              merchant que adiciona o scope, salva, e clica em "Instalar
              automaticamente" achando que basta — o token continua com
              os scopes antigos até a reinstalação. Esse bloco enfatiza
              o passo da reinstalação como o que provavelmente está
              faltando. */}
          {failed && (
            <>
              {install.missingScopes.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-3">
                  <p className="text-[12px] font-semibold text-amber-900">
                    1. Adicione pelo menos um destes escopos no Custom App:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {install.missingScopes.map((sc) => (
                      <li key={sc} className="text-[12px] font-mono text-gray-800">
                        <code className="bg-amber-100 px-1.5 py-0.5 rounded">{sc}</code>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={partnerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
                  >
                    Abrir Custom App na Shopify
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  {/* Reinstall step — this is the bit merchants miss. */}
                  <div className="mt-3 pt-3 border-t border-amber-100">
                    <p className="text-[12px] font-semibold text-red-700">
                      2. Reinstale o app na loja (passo crítico)
                    </p>
                    <p className="text-[11px] text-amber-800 mt-1 leading-snug">
                      Adicionar o escopo no Custom App <strong>não atualiza o
                      token</strong> que a Worder usa. Você precisa reinstalar
                      o app na <strong>{store.domain}</strong>:
                    </p>
                    <ul className="mt-1.5 text-[11px] text-amber-800 list-disc list-inside space-y-0.5">
                      <li>No Custom App, clique em <strong>Install app</strong> / <strong>Reinstall</strong>.</li>
                      <li>Confirme as novas permissões.</li>
                      <li>Copie o <strong>novo</strong> Admin API access token que aparece.</li>
                      <li>Cole na tela de <strong>conectar loja manual</strong> da Worder (mesmo domínio — só atualiza o token).</li>
                    </ul>
                  </div>

                  <div className="mt-3 pt-3 border-t border-amber-100 flex flex-wrap items-center gap-2">
                    <a
                      href="/integrations/shopify"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Atualizar token agora
                    </a>
                    <button
                      type="button"
                      onClick={autoInstall}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-amber-50 bg-amber-900 hover:bg-amber-800 rounded-md transition-colors"
                    >
                      {/* No spinner here: clicking transitions install.kind
                          to 'running' which closes the failed block, so the
                          primary CTA (with its own spinner) takes over. */}
                      <Zap className="w-3 h-3" />
                      Tentar instalar de novo
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3">
                <p className="text-[12px] font-semibold text-amber-900 mb-2">
                  Ou cole este script no <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">layout/theme.liquid</code> antes de <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">&lt;/body&gt;</code>:
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2">
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

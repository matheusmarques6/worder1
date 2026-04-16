'use client'

// =============================================
// WORDER: Tracking pixel install instructions
// /settings/tracking/install
//
// UI para merchant instalar o pixel no site dele (não-Shopify).
// =============================================

import { useEffect, useState } from 'react'
import { Copy, Check, ExternalLink, Code2, Zap, ShieldCheck } from 'lucide-react'

export default function InstallPixelPage() {
  const [orgId, setOrgId] = useState<string>('SEU_ORGANIZATION_ID')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/organization', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.organization?.id) setOrgId(d.organization.id)
      })
      .catch(() => {})
  }, [])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://worder1.vercel.app'

  const snippetScript = `<!-- Worder Pixel -->
<script>
  window.worderConfig = {
    organizationId: '${orgId}',
    apiUrl: '${baseUrl}'
  };
</script>
<script src="${baseUrl}/tracking.js" async></script>`

  const snippetCdn = `<script
  src="${baseUrl}/tracking.js"
  data-org="${orgId}"
  async></script>`

  const trackProductExample = `worder.productView({
  id: 'prod-123',
  name: 'Camiseta Premium',
  price: 99.90,
  category: 'Roupas'
});`

  const trackIdentifyExample = `worder.identify({
  email: 'cliente@exemplo.com',
  phone: '+5511999999999',
  first_name: 'João'
});`

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Instalar Pixel</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Cole o código abaixo antes do <code className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">&lt;/head&gt;</code> do seu
          site para começar a rastrear visitantes, carrinho abandonado, visualizações de produto e compras.
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <Zap className="w-5 h-5 text-[#FF6A2B] mb-2" />
          <p className="text-sm font-semibold text-zinc-900">Sem bloqueio</p>
          <p className="text-xs text-zinc-500 mt-1">Carrega async, usa Beacon API.</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <ShieldCheck className="w-5 h-5 text-[#FF6A2B] mb-2" />
          <p className="text-sm font-semibold text-zinc-900">LGPD-compatível</p>
          <p className="text-xs text-zinc-500 mt-1">Consentimento configurável, anti-spoof multi-tenant.</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <Code2 className="w-5 h-5 text-[#FF6A2B] mb-2" />
          <p className="text-sm font-semibold text-zinc-900">API JS simples</p>
          <p className="text-xs text-zinc-500 mt-1">worder.track(), worder.identify(), worder.purchase()</p>
        </div>
      </div>

      {/* Snippet 1 — Recomendado */}
      <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">1. Instalação recomendada</h2>
            <p className="text-sm text-zinc-500">Cole antes do fechamento da tag &lt;/head&gt;.</p>
          </div>
          <button
            onClick={() => copy('script', snippetScript)}
            className="inline-flex items-center gap-1.5 text-sm font-medium bg-[#FF6A2B] text-white px-3 py-1.5 rounded-lg hover:bg-[#E85D1F]"
          >
            {copied === 'script' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied === 'script' ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <pre className="p-4 bg-zinc-950 text-zinc-100 text-xs overflow-x-auto font-mono">{snippetScript}</pre>
      </section>

      {/* Snippet 2 — CDN */}
      <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">2. Alternativa — data-attribute</h2>
            <p className="text-sm text-zinc-500">Útil quando você não pode editar inline script.</p>
          </div>
          <button
            onClick={() => copy('cdn', snippetCdn)}
            className="inline-flex items-center gap-1.5 text-sm font-medium bg-white border border-zinc-200 text-zinc-700 px-3 py-1.5 rounded-lg hover:bg-zinc-50"
          >
            {copied === 'cdn' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied === 'cdn' ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <pre className="p-4 bg-zinc-950 text-zinc-100 text-xs overflow-x-auto font-mono">{snippetCdn}</pre>
      </section>

      {/* Shopify quick install */}
      <section className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">S</span>
          Loja Shopify?
        </h2>
        <p className="text-sm text-zinc-600 mt-2">
          Se já conectou sua loja via OAuth, o pixel é instalado automaticamente (Web Pixel + App Embed).
          Não precisa colar código.
        </p>
        <a
          href="/integrations/shopify"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 mt-3"
        >
          Ver status da integração <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </section>

      {/* API examples */}
      <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">3. Rastreando eventos customizados</h2>
          <p className="text-sm text-zinc-500">Chame a API JS após o snippet principal.</p>
        </div>
        <div className="divide-y divide-zinc-100">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-zinc-700">Identificar usuário logado</p>
              <button onClick={() => copy('identify', trackIdentifyExample)} className="text-xs text-[#FF6A2B]">
                {copied === 'identify' ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <pre className="p-3 bg-zinc-950 text-zinc-100 text-xs overflow-x-auto font-mono rounded">{trackIdentifyExample}</pre>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-zinc-700">Visualizar produto</p>
              <button onClick={() => copy('product', trackProductExample)} className="text-xs text-[#FF6A2B]">
                {copied === 'product' ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <pre className="p-3 bg-zinc-950 text-zinc-100 text-xs overflow-x-auto font-mono rounded">{trackProductExample}</pre>
          </div>
        </div>
      </section>

      {/* Test */}
      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-zinc-900">4. Testar instalação</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Depois de instalar, abra seu site, navegue entre páginas e volte aqui na aba <strong>Tracking</strong>.
          Se você ver eventos nas últimas 24h, está tudo certo.
        </p>
        <a
          href="/settings/tracking"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#FF6A2B] hover:underline mt-3"
        >
          Ver status e eventos recentes <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </section>
    </div>
  )
}

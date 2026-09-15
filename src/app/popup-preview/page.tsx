'use client'

// =============================================================
// A BANCADA DE TESTE DO POPUP
//
// Durante muito tempo a "pré-visualização" do editor era uma segunda
// implementação do popup: componentes React que DESENHAVAM o que o
// runtime desenharia. O resultado era previsível — não dava para avançar
// de etapa, não dava para raspar, não dava para girar, e qualquer coisa
// que o runtime fizesse diferente do React só aparecia na loja do
// cliente.
//
// Esta página apaga a segunda implementação. Ela é um iframe que roda o
// SCRIPT DE VERDADE, o mesmo que o snippet carrega na loja, com a rede
// trocada por uma bancada:
//
//   /submit          responde como o servidor responderia, sorteando o
//                    prêmio pelos mesmos pesos do design (o sorteio de
//                    verdade também é do servidor — aqui ele só acontece
//                    mais perto).
//   /events, /track  engolidos: teste não polui métrica.
//   /known-fields    sempre vazio, para o formulário abrir limpo.
//   geo, gates       liberados.
//
// O design chega por postMessage do editor (mesma origem, verificada), e
// não pela URL: o que está sendo testado normalmente ainda não foi salvo.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { respostaDeEnvioDePreview } from '@/lib/popups/preview-bench'

type Mensagem = { type: string; script?: string; design?: any; formId?: string }

export default function PopupPreviewPage() {
  const [pronto, setPronto] = useState(false)
  const designRef = useRef<any>(null)

  // A bancada: instalada uma vez, antes de qualquer script entrar.
  const instalarRede = useCallback(() => {
    const real = window.fetch.bind(window)
    const json = (corpo: any) => new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } })

    window.fetch = (async (entrada: any, init?: RequestInit) => {
      const url = String(typeof entrada === 'string' ? entrada : entrada?.url || '')
      // Só a API do popup é encenada. Imagem, fonte e afins continuam
      // saindo de verdade — senão a pré-visualização mentiria justamente
      // sobre o que mais quebra: a imagem que não carrega.
      if (url.includes('/api/public/forms/')) {
        if (url.includes('/submit')) {
          // O sorteio e o cupom saem da mesma regra do servidor — inclusive
          // o caso de não ganhar nada, que é o que ninguém testa.
          return json(respostaDeEnvioDePreview(designRef.current || {}))
        }
        if (url.includes('/preview-allowed')) return json({ allowed: true })
        if (url.includes('/known-fields')) return json({ fields: {} })
        return json({ ok: true })
      }
      if (url.includes('/api/public/geo')) return json({ country: null })
      if (url.includes('/api/track')) return json({ ok: true })
      return real(entrada, init)
    }) as typeof window.fetch

    // O beacon de métrica também não pode escapar da bancada.
    try {
      Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => true })
    } catch {
      /* navegador que não deixa: o fetch acima já cobre o caminho de volta */
    }
  }, [])

  useEffect(() => {
    instalarRede()
    function aoReceber(ev: MessageEvent<Mensagem>) {
      if (ev.origin !== window.location.origin) return
      if (ev.source !== window.parent) return
      const m = ev.data
      if (!m || m.type !== 'wf-preview-script' || typeof m.script !== 'string') return
      designRef.current = m.design || {}
      setPronto(true)
      // O formulário do tipo "embed" não flutua: procura um container com
      // data-worder-form="<id>" na página. Sem ele a bancada mostraria
      // "container ausente" em vez do formulário. E o container precisa
      // existir ANTES do script rodar.
      if ((m.design?.formType || 'popup') === 'embed' && m.formId) {
        const host = document.createElement('div')
        host.setAttribute('data-worder-form', String(m.formId))
        host.style.cssText = 'max-width:720px;margin:24px auto'
        document.getElementById('wf-preview-embed')?.appendChild(host)
      }
      try {
        // eslint-disable-next-line no-new-func
        new Function(m.script)()
      } catch (e) {
        console.error('[preview] o script do popup não rodou:', e)
      }
    }
    window.addEventListener('message', aoReceber)
    try { window.parent?.postMessage({ type: 'wf-preview-ready' }, window.location.origin) } catch { /* sem pai: página aberta solta */ }
    return () => window.removeEventListener('message', aoReceber)
  }, [instalarRede])

  // O fundo é o esqueleto de uma loja: dá escala ao popup sem competir
  // com ele por atenção.
  return (
    <div className="min-h-screen bg-gray-200" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #d1d5db 40px, #d1d5db 41px)' }}>
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="h-8 w-48 bg-gray-300 rounded mb-8" />
        <div className="flex gap-6 mb-6">
          <div className="h-4 flex-1 bg-gray-300 rounded" /><div className="h-4 w-24 bg-gray-300 rounded" /><div className="h-4 w-32 bg-gray-300 rounded" />
        </div>
        <div className="space-y-3 mb-8">
          <div className="h-3 w-full bg-gray-300/60 rounded" /><div className="h-3 w-5/6 bg-gray-300/60 rounded" /><div className="h-3 w-4/6 bg-gray-300/60 rounded" />
        </div>
        <div className="h-48 bg-gray-300/40 rounded-lg mb-8" />
        <div className="space-y-3">
          <div className="h-3 w-full bg-gray-300/60 rounded" /><div className="h-3 w-3/4 bg-gray-300/60 rounded" /><div className="h-3 w-5/6 bg-gray-300/60 rounded" />
        </div>
        <div id="wf-preview-embed" />
        {!pronto && <p className="mt-10 text-center text-xs text-gray-500">Carregando a pré-visualização…</p>}
      </div>
    </div>
  )
}

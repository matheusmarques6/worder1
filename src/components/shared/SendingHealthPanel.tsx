'use client'

// =============================================
// Painel de saúde do envio.
//
// A mesma ideia do painel dos popups, do outro lado do funil: só aparece
// quando há o que resolver, e cada item diz o que está errado, por que
// importa e para onde ir. Nunca um número solto.
//
// Vive onde o lojista trabalha (campanhas, WhatsApp), não numa tela de
// diagnóstico que ninguém abre — um domínio que caiu precisa aparecer no
// caminho de quem vai disparar, antes do disparo.
//
// Falha de rede aqui não atrapalha a tela que o hospeda: o painel
// simplesmente não aparece.
// =============================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WarningCircle, CaretRight } from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'

interface Issue {
  level: 'error' | 'warn'
  kind: string
  channel: 'email' | 'whatsapp'
  subject: string | null
  title: string
  detail: string
  action: string
  href: string | null
}

interface Payload {
  counts: { error: number; warn: number }
  issues: Issue[]
}

interface Props {
  /** Mostra só um canal. Sem isto, mostra os dois. */
  channel?: 'email' | 'whatsapp'
  className?: string
}

export function SendingHealthPanel({ channel, className }: Props) {
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  const [data, setData] = useState<Payload | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Antes de hidratar, a loja atual ainda não é conhecida: uma consulta
    // agora traria o painel da organização inteira e ele piscaria.
    if (!hasHydrated) return
    let cancelled = false
    const qs = currentStore?.id ? `?storeId=${encodeURIComponent(currentStore.id)}` : ''
    fetch(`/api/sending/health${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hasHydrated, currentStore?.id])

  const issues = (data?.issues || []).filter((i) => !channel || i.channel === channel)
  if (issues.length === 0) return null

  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.length - errors
  const grave = errors > 0

  return (
    <div className={`rounded-xl border ${grave ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'} ${className || ''}`}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <WarningCircle size={16} weight="fill" className={grave ? 'text-red-600 flex-shrink-0' : 'text-amber-600 flex-shrink-0'} />
        <span className={`text-xs font-medium ${grave ? 'text-red-800' : 'text-amber-800'}`}>
          {grave
            ? `${errors} ${errors === 1 ? 'problema impedindo suas mensagens de chegar' : 'problemas impedindo suas mensagens de chegar'}`
            : `${warns} ${warns === 1 ? 'ponto de atenção no envio' : 'pontos de atenção no envio'}`}
          {grave && warns > 0 && ` · ${warns} ${warns === 1 ? 'ponto de atenção' : 'pontos de atenção'}`}
        </span>
        <span className={`ml-auto text-[11px] ${grave ? 'text-red-600' : 'text-amber-600'}`}>{open ? 'ocultar' : 'ver detalhes'}</span>
      </button>

      {open && (
        <ul className="px-4 pb-3 space-y-2">
          {issues.map((it, i) => (
            <li key={`${it.kind}-${i}`} className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.level === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-900">
                    {it.title}
                    {it.subject && <span className="font-normal text-gray-500"> · {it.subject}</span>}
                  </p>
                  <p className="text-[12px] text-gray-600 mt-0.5 leading-snug">{it.detail}</p>
                  <p className="text-[12px] text-gray-500 mt-1 leading-snug">{it.action}</p>
                </div>
                {it.href && (
                  <Link href={it.href}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-2.5 py-1.5">
                    Resolver <CaretRight size={12} weight="bold" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

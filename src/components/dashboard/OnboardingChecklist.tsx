'use client'

// =============================================
// Roteiro de primeiros passos.
//
// Substitui o aviso solto de "conecte sua loja", que dizia o primeiro
// passo e depois sumia, deixando o lojista sozinho com trinta telas e
// nenhuma ordem entre elas.
//
// Cada passo é marcado por um FATO no banco. Não há botão de "marcar
// como feito": se a lista pudesse ser marcada à mão, ela viraria uma
// lista de intenções — e o passo que faltou é justamente o que ninguém
// lembra de conferir.
//
// Some sozinho quando tudo está feito. O lojista também pode dispensar;
// a escolha fica no navegador dele.
// =============================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, Circle, Lock, X, ArrowRight } from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'

interface Step {
  id: string
  title: string
  detail: string
  done: boolean
  cta: string
  href: string
  blockedBy: string | null
}
interface Checklist {
  steps: Step[]
  done: number
  total: number
  complete: boolean
  next: Step | null
}

const DISPENSADO = 'worder.onboarding.dismissed'

export function OnboardingChecklist() {
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  const [data, setData] = useState<Checklist | null>(null)
  const [dispensado, setDispensado] = useState(true)

  useEffect(() => {
    // Preferência do navegador; um bloqueio de armazenamento não pode
    // derrubar a tela.
    try { setDispensado(localStorage.getItem(DISPENSADO) === '1') } catch { setDispensado(false) }
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    let cancelled = false
    const qs = currentStore?.id ? `?storeId=${encodeURIComponent(currentStore.id)}` : ''
    fetch(`/api/onboarding/checklist${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hasHydrated, currentStore?.id])

  const dispensar = () => {
    setDispensado(true)
    try { localStorage.setItem(DISPENSADO, '1') } catch { /* sem armazenamento, vale só nesta sessão */ }
  }

  if (!data || data.complete || dispensado) return null

  return (
    <section aria-labelledby="onboarding-titulo"
      className="mb-11 rounded-[14px] bg-white overflow-hidden" style={{ border: '1px solid #E4E4E7' }}>
      <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="onboarding-titulo" className="text-[14px] font-bold text-[#18181B]" style={{ letterSpacing: '-0.01em' }}>
            Primeiros passos
          </h2>
          <p className="text-[13px] text-[#71717A] mt-1 leading-relaxed">
            {data.next
              ? <>O próximo é <span className="font-medium text-[#18181B]">{data.next.title.toLowerCase()}</span>.</>
              : 'Termine os passos liberados para destravar os próximos.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[12px] text-[#A1A1AA] tabular-nums">{data.done} de {data.total}</span>
          <button onClick={dispensar} aria-label="Dispensar os primeiros passos"
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#18181B] hover:bg-[#F4F4F5] transition-colors">
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Progresso */}
      <div className="px-6" aria-hidden>
        <div className="h-1 rounded-full bg-[#F4F4F5] overflow-hidden">
          <div className="h-full bg-[#18181B] transition-[width] duration-500"
            style={{ width: `${Math.round((data.done / Math.max(1, data.total)) * 100)}%` }} />
        </div>
      </div>

      <ul className="px-6 py-4 divide-y divide-[#F4F4F5]">
        {data.steps.map((s) => {
          const preso = !s.done && !!s.blockedBy
          return (
            <li key={s.id} className="py-3 flex items-start gap-3">
              {s.done
                ? <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                : preso
                  ? <Lock size={18} className="text-[#D4D4D8] shrink-0 mt-0.5" />
                  : <Circle size={18} className="text-[#D4D4D8] shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-medium ${s.done ? 'text-[#A1A1AA] line-through' : 'text-[#18181B]'}`}>
                  {s.title}
                </p>
                {!s.done && (
                  <p className="text-[12px] text-[#71717A] mt-0.5 leading-relaxed">
                    {preso ? `Depois de: ${s.blockedBy}.` : s.detail}
                  </p>
                )}
              </div>
              {!s.done && !preso && (
                <Link href={s.href}
                  className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#18181B] hover:bg-[#27272A] transition-colors px-3 py-1.5 rounded-[8px]">
                  {s.cta} <ArrowRight size={12} weight="bold" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

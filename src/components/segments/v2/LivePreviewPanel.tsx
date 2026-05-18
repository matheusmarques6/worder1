'use client'

// LivePreviewPanel — sticky right rail showing the rule's current
// match count + a sample of matching contacts. Debounces against the
// rule prop so we don't fire a preview request on every keystroke.
//
// Klaviyo: just a count. Omnisend: count + percentage. We render
// both plus a 10-contact sample because preview accuracy matters
// when builders write a rule like "VIP + churn>0.8" by hand.

import { useEffect, useState } from 'react'
import { Users, Sparkle, Loader2, AlertTriangle } from 'lucide-react'
import type { SegmentRule } from '@/lib/segments/dsl'

interface Contact {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  total_orders?: number | null
  total_spent?: number | null
  lifecycle_stage?: string | null
}

interface Props {
  rule: SegmentRule
  organizationId: string | null
  storeId?: string | null
  totalContacts?: number     // org-wide contacts, used to compute %
}

export function LivePreviewPanel({ rule, organizationId, storeId, totalContacts }: Props) {
  const [count, setCount] = useState<number | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [sample, setSample] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    if (rule.root.children.length === 0) {
      setCount(null); setSample([]); setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/segments/preview-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule, organization_id: organizationId, store_id: storeId ?? null }),
        })
        if (cancelled) return
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'preview falhou')
          setCount(null); setSample([])
        } else {
          setError(null)
          setCount(data.count ?? 0)
          setTruncated(!!data.truncated)
          setSample(data.sample || [])
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'preview falhou')
          setCount(null); setSample([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 500)

    return () => { cancelled = true; clearTimeout(handle) }
  }, [JSON.stringify(rule), organizationId, storeId])

  const percentage = (count !== null && totalContacts && totalContacts > 0)
    ? (count / totalContacts) * 100
    : null

  return (
    <aside className="sticky top-6 w-full bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
          <Sparkle size={14} className="text-brand-500" />
          Pré-visualização
        </h3>
        {loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
      </header>

      {error ? (
        <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700 flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : count === null ? (
        <p className="text-xs text-gray-400">
          Adicione filtros para ver quantos contatos entram no segmento.
        </p>
      ) : (
        <>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900 tabular-nums">
                {truncated ? '5.000+' : count.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-gray-500">contatos</span>
            </div>
            {percentage !== null && !truncated && (
              <p className="text-xs text-gray-500 mt-1">
                {percentage < 0.1 ? '< 0,1' : percentage.toFixed(1).replace('.', ',')}% da sua base
              </p>
            )}
            {truncated && (
              <p className="text-xs text-amber-600 mt-1">
                Mais de 5.000 — refine o filtro para ver o número exato
              </p>
            )}
          </div>

          {sample.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <Users size={11} />
                Amostra ({sample.length})
              </p>
              <ul className="space-y-1.5">
                {sample.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email?.split('@')[0] || 'Sem nome'
                  return (
                    <li key={c.id} className="text-xs text-gray-700 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{c.email || c.phone || '—'}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

'use client'

// =============================================
// MergeStoresPanel
//
// Detects when the active store has a likely-duplicate shopify_stores
// row in the same organization (same shopify_shop_id or same shop_name)
// and offers an inline "Mesclar" action that consolidates them into the
// active row.
//
// Used on the tracking-debug dashboard so merchants who reconnected
// Shopify with a different myshopifyDomain — and ended up with two
// "stores" in Worder — can fix the split without contacting support.
// =============================================

import { useEffect, useState } from 'react'
import { useStoreStore } from '@/stores'
import { AlertTriangle, ArrowDownLeft, Loader2, CheckCircle2 } from 'lucide-react'

interface Candidate {
  id: string
  shop_name: string | null
  shop_domain: string | null
  shop_domain_aliases: string[]
  shopify_shop_id: string | null
  is_active: boolean
  installed_at: string | null
  status: string | null
  score: number
  reason: 'same_shop_id' | 'same_shop_name' | 'manual'
}

export function MergeStoresPanel() {
  const { currentStore } = useStoreStore()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [merging, setMerging] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!currentStore?.id) return
      try {
        const res = await fetch(`/api/integrations/shopify/mergeable-stores?targetStoreId=${currentStore.id}`)
        if (!res.ok) return
        const j = await res.json()
        // Only surface candidates with a score > 0 (likely duplicates).
        // Manual merge can still happen via store switcher → settings,
        // but we don't want to nag every merchant that has 2 stores.
        const likely = (j.candidates || []).filter((c: Candidate) => c.score > 0)
        setCandidates(likely)
      } catch { /* silent */ }
    }
    load()
  }, [currentStore?.id])

  async function merge(sourceId: string) {
    if (!currentStore?.id) return
    setMerging(sourceId)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/integrations/shopify/merge-stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceStoreId: sourceId, targetStoreId: currentStore.id }),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        setError(j.error || 'Falhou.')
        return
      }
      const moved = Object.entries(j.reassignments || {})
        .filter(([, n]: any) => n > 0)
        .map(([t, n]: any) => `${n} ${t}`)
        .join(', ')
      setResult(`Mesclagem completa. ${moved || 'nenhum dado movido'}.`)
      setCandidates((prev) => prev.filter((c) => c.id !== sourceId))
    } catch (e: any) {
      setError(e?.message || 'Erro de rede')
    } finally {
      setMerging(null)
    }
  }

  if (!candidates || candidates.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-900">
            {candidates.length} {candidates.length === 1 ? 'loja duplicada detectada' : 'lojas duplicadas detectadas'}
          </p>
          <p className="text-[11.5px] text-amber-800 mt-0.5 leading-relaxed">
            Reconexões da Shopify com domínio diferente criaram registros separados.
            Mesclar transfere todos os dados (automações, contatos, eventos, segmentos) para a loja atual e arquiva a duplicata.
            <strong className="ml-1">A loja atual permanece como destino — todos os fluxos serão preservados.</strong>
          </p>
        </div>
      </div>
      <div className="divide-y divide-amber-100">
        {candidates.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3 bg-white">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-gray-900 truncate">
                {c.shop_name || 'Loja sem nome'}
                <span className="text-[10.5px] ml-2 px-1.5 py-0.5 rounded font-mono uppercase tracking-wide" style={{
                  background: c.reason === 'same_shop_id' ? '#FEE2E2' : '#FEF3C7',
                  color: c.reason === 'same_shop_id' ? '#991B1B' : '#92400E',
                }}>
                  {c.reason === 'same_shop_id' ? 'mesma loja Shopify' : 'mesmo nome'}
                </span>
              </p>
              <p className="text-[11px] text-gray-500 font-mono truncate">
                {c.shop_domain}{c.shop_domain_aliases.length > 0 && <> · aliases: {c.shop_domain_aliases.join(', ')}</>}
              </p>
              <p className="text-[10.5px] text-gray-400">
                {c.is_active ? 'ativa' : `arquivada (${c.status || 'sem status'})`} · instalada {c.installed_at ? new Date(c.installed_at).toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
            <button
              onClick={() => merge(c.id)}
              disabled={merging === c.id}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors flex-shrink-0"
              title={`Mesclar dados desta loja em ${currentStore?.name || 'loja atual'}`}
            >
              {merging === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
              Mesclar
            </button>
          </div>
        ))}
      </div>
      {result && (
        <div className="px-4 py-2.5 bg-emerald-50 border-t border-emerald-200 text-[12px] text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {result}
        </div>
      )}
      {error && (
        <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 text-[12px] text-red-800">
          {error}
        </div>
      )}
    </div>
  )
}

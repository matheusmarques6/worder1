'use client'

// New segment builder — v2 DSL, AI-assisted, live preview with sample.
// Replaces the legacy hand-rolled builder. Old segments (rule_version=1)
// still load via the adapter; this page always saves v2 rules.
//
// Modes:
//  - /segments/new                   → create (gallery + blank builder)
//  - /segments/new?edit=<segmentId>  → edit existing (loads rule, hides gallery)

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'
import { SegmentBuilder } from '@/components/segments/v2/SegmentBuilder'
import { SegmentTemplateGallery } from '@/components/segments/v2/SegmentTemplateGallery'
import type { SegmentRule } from '@/lib/segments/dsl'
import type { SegmentMetadata } from '@/components/segments/v2/SegmentBuilder'

export default function NewSegmentPage() {
  const router = useRouter()
  const search = useSearchParams()
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const editId = search.get('edit')

  const [totalContacts, setTotalContacts] = useState<number | undefined>(undefined)
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([])
  const [segments, setSegments] = useState<Array<{ id: string; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [initialRule, setInitialRule] = useState<SegmentRule | undefined>(undefined)
  const [initialMeta, setInitialMeta] = useState<Partial<SegmentMetadata> | undefined>(undefined)
  const [loadingExisting, setLoadingExisting] = useState(!!editId)
  const [showGallery, setShowGallery] = useState(!editId)

  // Load lists for the "is in list X" rule type
  // Plus available segments for the "is in segment Y" composition rule
  useEffect(() => {
    if (!user?.organization_id) return
    const qs = currentStore?.id ? `?store_id=${currentStore.id}` : ''
    fetch(`/api/lists${qs}`)
      .then((r) => r.json())
      .then((d) => setLists((d.lists || []).map((l: any) => ({ id: l.id, name: l.name }))))
      .catch(() => {})
    fetch(`/api/segments${qs}`)
      .then((r) => r.json())
      .then((d) => setSegments((d.segments || []).map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => {})
  }, [user?.organization_id, currentStore?.id])

  // Edit mode: hydrate the builder from the existing segment row.
  // The /rule-v2 GET endpoint returns the v2 rule (running v1→v2
  // adapter for legacy segments) so the builder always works with v2.
  useEffect(() => {
    if (!editId || !user?.organization_id) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/segments/${editId}/rule-v2`)
        if (!res.ok) {
          if (!cancelled) setLoadingExisting(false)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setInitialRule(data.rule)
        setInitialMeta({
          name: data.name,
          description: data.description || '',
          color: data.color || '#F97316',
        })
      } finally {
        if (!cancelled) setLoadingExisting(false)
      }
    })()
    return () => { cancelled = true }
  }, [editId, user?.organization_id])

  async function handleSave(rule: SegmentRule, meta: SegmentMetadata) {
    setSubmitting(true)
    try {
      let segmentId = editId
      if (!segmentId) {
        // Create flow — make the segment row first, then write the v2 rule.
        const createRes = await fetch('/api/segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: meta.organizationId,
            store_id: meta.storeId,
            name: meta.name,
            description: meta.description || null,
            color: meta.color,
            segment_type: 'dynamic',
            rules: [],
            rules_logic: 'AND',
          }),
        })
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}))
          throw new Error(err.error || 'falha ao criar segmento')
        }
        const created = await createRes.json()
        segmentId = created.segment?.id || created.id
      } else {
        // Edit flow — patch metadata first
        await fetch('/api/segments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: segmentId,
            name: meta.name,
            description: meta.description || null,
            color: meta.color,
          }),
        })
      }

      // Persist the v2 rule
      await fetch(`/api/segments/${segmentId}/rule-v2`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule }),
      })

      router.push(`/segments/${segmentId}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user?.organization_id || loadingExisting) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5 p-6">
      <header className="flex items-center gap-3">
        <Link href="/segments" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {editId ? 'Editar segmento' : 'Novo segmento'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {editId
              ? 'Ajuste as regras e salve. O segmento recalcula automaticamente.'
              : 'Filtros dinâmicos atualizam o segmento automaticamente conforme os contatos mudam.'}
          </p>
        </div>
      </header>

      {showGallery && !editId && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <SegmentTemplateGallery
            onPick={(t) => {
              setInitialRule(t.rule)
              setInitialMeta({ name: t.name })
              setShowGallery(false)
            }}
          />
          <button
            onClick={() => setShowGallery(false)}
            className="mt-4 text-xs text-gray-500 hover:text-gray-700"
          >
            Começar do zero →
          </button>
        </div>
      )}

      <SegmentBuilder
        key={editId || (initialRule ? 'with-template' : 'blank')}
        initialRule={initialRule}
        initialMetadata={initialMeta}
        organizationId={user.organization_id}
        storeId={currentStore?.id || null}
        totalContacts={totalContacts}
        lists={lists}
        segments={segments}
        currentSegmentId={editId || undefined}
        onSave={handleSave}
        onCancel={() => router.push(editId ? `/segments/${editId}` : '/segments')}
        submitting={submitting}
      />
    </div>
  )
}

'use client'

// New segment builder — v2 DSL, AI-assisted, live preview with sample.
// Replaces the legacy hand-rolled builder. Old segments (rule_version=1)
// still load via the adapter; this page always creates v2 rules.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'
import { SegmentBuilder } from '@/components/segments/v2/SegmentBuilder'
import type { SegmentRule } from '@/lib/segments/dsl'
import type { SegmentMetadata } from '@/components/segments/v2/SegmentBuilder'

export default function NewSegmentPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const [totalContacts, setTotalContacts] = useState<number | undefined>(undefined)
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user?.organization_id) return

    // Lists for the "is in list X" rule type
    fetch(`/api/lists${currentStore?.id ? `?store_id=${currentStore.id}` : ''}`)
      .then((r) => r.json())
      .then((d) => setLists((d.lists || []).map((l: any) => ({ id: l.id, name: l.name }))))
      .catch(() => {})
  }, [user?.organization_id, currentStore?.id])

  async function handleSave(rule: SegmentRule, meta: SegmentMetadata) {
    setSubmitting(true)
    try {
      // Create the segment row first (v1 endpoint accepts v2 payload —
      // it's a JSONB blob either way), then write the v2 rule + deps.
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
      const segmentId: string = created.segment?.id || created.id

      // Persist the v2 rule. Endpoint described in the route file.
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

  if (!user?.organization_id) {
    return <div className="p-8 text-sm text-gray-500">Carregando…</div>
  }

  return (
    <div className="space-y-5 p-6">
      <header className="flex items-center gap-3">
        <Link href="/segments" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Novo segmento</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Filtros dinâmicos atualizam o segmento automaticamente conforme os contatos mudam.
          </p>
        </div>
      </header>

      <SegmentBuilder
        organizationId={user.organization_id}
        storeId={currentStore?.id || null}
        totalContacts={totalContacts}
        lists={lists}
        onSave={handleSave}
        onCancel={() => router.push('/segments')}
        submitting={submitting}
      />
    </div>
  )
}

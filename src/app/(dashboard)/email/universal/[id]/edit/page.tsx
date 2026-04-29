'use client'

import { toast } from '@/components/ui/Toast'
// ─────────────────────────────────────────────────────────────────────────
// Dedicated editor for a single universal (saved) block or section.
//
// This is the Klaviyo/Omnisend-style "separate editor" the user asked for:
// instead of editing the universal in the middle of an email (which makes
// the propagation feel implicit), this page opens the universal by itself
// on a clean canvas. Saving here PATCHes /api/email/saved-blocks/{id} so
// every email using the block picks up the change on its next open.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2, Star } from 'lucide-react'
import {
  createSection,
  type EmailDocument,
  type EmailSection,
  type EmailBlock,
} from '@/components/email-builder/config/types'

const WorderEditor = dynamic(
  () => import('@/components/email-builder/WorderEmailEditor'),
  { ssr: false }
)

interface SavedRow {
  id: string
  name: string
  category: string | null
  block_json: any
}

export default function EditUniversalPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [saved, setSaved] = useState<SavedRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/email/saved-blocks/${id}`)
        if (!res.ok) throw new Error('Bloco universal não encontrado')
        const data = await res.json()
        if (cancelled) return
        if (!data?.block) throw new Error('Bloco universal não encontrado')
        setSaved(data.block as SavedRow)
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // Detect whether this saved row is a section or a block.
  const isSection = useMemo(() => {
    if (!saved) return false
    return saved.block_json?._kind === 'section' || saved.category === 'section'
  }, [saved])

  // Synthesise a single-section email document wrapping just this universal
  // so the existing WorderEmailEditor can edit it without any special-casing.
  const design: EmailDocument | null = useMemo(() => {
    if (!saved) return null

    const settings = {
      backgroundColor: '#f3f4f6',
      contentBackgroundColor: '#ffffff',
      contentWidth: 600,
      fontFamily: "'DM Sans', Arial, sans-serif",
      borderRadius: 0,
      preheaderText: '',
    } as EmailDocument['settings']

    if (isSection) {
      const sec: EmailSection = saved.block_json?.section || saved.block_json
      return {
        version: 2,
        settings,
        // IMPORTANT: strip the link fields so the dedicated editor doesn't
        // attempt to re-sync to itself on every keystroke. We only save
        // when the user clicks Save, and we PATCH directly below.
        sections: [{
          ...sec,
          _savedSectionId: undefined,
          _savedSectionName: undefined,
        } as EmailSection],
      }
    }

    // Block: wrap it in a one-column section.
    const block: EmailBlock = { ...(saved.block_json as EmailBlock) }
    delete (block as any)._savedBlockId
    delete (block as any)._savedBlockName
    const wrapperSection = createSection([100])
    wrapperSection.columns[0].blocks = [block]
    return {
      version: 2,
      settings,
      sections: [wrapperSection],
    }
  }, [saved, isSection])

  // Save pulls the edited block/section back out of the synthetic doc and
  // PATCHes saved_blocks. No need to touch email_templates.
  const handleSave = useCallback(async (docOut: Record<string, any>) => {
    if (!saved) return false
    try {
      let body: any
      if (isSection) {
        const outSection = docOut.sections?.[0]
        if (!outSection) return false
        const clean = JSON.parse(JSON.stringify(outSection))
        delete clean._savedSectionId
        delete clean._savedSectionName
        for (const col of clean.columns || []) {
          for (const b of col.blocks || []) {
            delete b._savedBlockId
            delete b._savedBlockName
          }
        }
        body = { block_json: { _kind: 'section', section: clean } }
      } else {
        const outBlock = docOut.sections?.[0]?.columns?.[0]?.blocks?.[0]
        if (!outBlock) return false
        const clean = { ...outBlock }
        delete clean._savedBlockId
        delete clean._savedBlockName
        body = { block_json: clean }
      }

      const res = await fetch(`/api/email/saved-blocks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ type: 'error', title: 'Erro ao salvar: ' + (err.error || 'Tente novamente') })
        return false
      }
      // Broadcast to sibling tabs so any other open email editor can re-
      // hydrate the linked blocks/sections right away (no reload needed).
      try {
        localStorage.setItem('worder:universal-saved', JSON.stringify({ id, at: Date.now() }))
      } catch { /* private-mode / full storage — non-fatal */ }
      return true
    } catch (err: any) {
      toast({ type: 'error', title: 'Erro ao salvar: ' + err.message })
      return false
    }
  }, [id, isSection, saved])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    )
  }

  if (error || !saved || !design) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center">
          <p className="text-base font-medium text-gray-500 mb-2">{error || 'Bloco universal não encontrado'}</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-brand-500 hover:text-brand-600 font-medium"
          >
            Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Klaviyo-style context banner so the user knows this is a GLOBAL edit */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white text-[12px] font-medium flex-shrink-0">
        <Star className="w-3.5 h-3.5 fill-white" />
        <span>
          Editando {isSection ? 'seção' : 'bloco'} universal&nbsp;
          <strong className="font-semibold">“{saved.name}”</strong>
          &nbsp;— alterações aqui se aplicam a todos os emails que usam{' '}
          {isSection ? 'essa seção.' : 'esse bloco.'}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <WorderEditor
          templateName={`Universal: ${saved.name}`}
          design={design}
          onSave={handleSave}
          onBack={() => router.back()}
        />
      </div>
    </div>
  )
}

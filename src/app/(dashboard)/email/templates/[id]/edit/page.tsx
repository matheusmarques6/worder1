'use client'

import { toast } from '@/components/ui/Toast'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const WorderEditor = dynamic(() => import('@/components/email-builder/WorderEmailEditor'), { ssr: false })
// Text-based editor is dispatched at runtime so its bundle only loads
// for templates that actually use it.
const TextEmailEditor = dynamic(() => import('@/components/email-text-builder/TextEmailEditor'), { ssr: false })

export default function EditTemplatePage() {
  const params = useParams()
  const router = useRouter()
  const templateId = params.id as string

  const [template, setTemplate] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`)
      if (!res.ok) throw new Error('Template não encontrado')
      const data = await res.json()
      setTemplate(data.template || data)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar template')
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => { fetchTemplate() }, [fetchTemplate])

  const handleSaveVisual = async (design: Record<string, any>, html: string) => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, design_json: design, html }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ type: 'error', title: 'Erro ao salvar: ' + (err.error || 'Tente novamente') })
        return false
      }
      return true
    } catch (err: any) {
      toast({ type: 'error', title: 'Erro ao salvar: ' + err.message })
      return false
    }
  }

  // Text-based save also persists subject / preview_text into their
  // dedicated columns so flow worker / send pipeline can read them
  // without parsing the design payload.
  const handleSaveText = async (design: any, html: string) => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design,
          design_json: design,
          html,
          subject: design.subject,
          preview_text: design.previewText,
          editor_type: 'text',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ type: 'error', title: 'Erro ao salvar: ' + (err.error || 'Tente novamente') })
        return false
      }
      return true
    } catch (err: any) {
      toast({ type: 'error', title: 'Erro ao salvar: ' + err.message })
      return false
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center">
          <p className="text-base font-medium text-gray-500 mb-2">{error || 'Template não encontrado'}</p>
          <button onClick={() => router.push('/email/templates')} className="text-sm text-brand-500 hover:text-brand-600 font-medium">Voltar</button>
        </div>
      </div>
    )
  }

  const handleRename = async (name: string) => {
    try {
      await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      setTemplate((prev: any) => prev ? { ...prev, name } : prev)
    } catch {}
  }

  // editor_type dispatch — defaults to 'visual' so legacy templates
  // (created before the column existed) keep loading the drag-and-drop
  // editor exactly as before.
  if (template.editor_type === 'text') {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <TextEmailEditor
          templateName={template.name || 'Template'}
          templateId={templateId}
          design={template.design_json || template.design}
          onSave={handleSaveText}
          onRename={handleRename}
          onBack={() => router.push('/email/templates')}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-white">
      <WorderEditor
        templateName={template.name || 'Template'}
        design={template.design_json || template.design}
        onSave={handleSaveVisual}
        onRename={handleRename}
        onBack={() => router.push('/email/templates')}
      />
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const UnlayerEditor = dynamic(() => import('@/components/email/email-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-white">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="text-sm text-gray-500">Carregando editor...</p>
      </div>
    </div>
  ),
})

interface TemplateData {
  id: string
  name: string
  category?: string
  design?: Record<string, any>
  design_json?: Record<string, any>
  html?: string
}

export default function EditTemplatePage() {
  const params = useParams()
  const router = useRouter()
  const templateId = params.id as string

  const [template, setTemplate] = useState<TemplateData | null>(null)
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

  useEffect(() => {
    fetchTemplate()
  }, [fetchTemplate])

  const handleSave = async (design: Record<string, any>, html: string) => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, html }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Save failed:', err)
        alert('Erro ao salvar: ' + (err.error || 'Tente novamente'))
        return false
      }
      return true
    } catch (err: any) {
      console.error('Save failed:', err)
      alert('Erro ao salvar: ' + err.message)
      return false
    }
  }

  const handleBack = () => {
    router.push('/email/templates')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-gray-500">Carregando template...</p>
        </div>
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-base font-medium text-gray-500 mb-2">
            {error || 'Template não encontrado'}
          </p>
          <button
            onClick={handleBack}
            className="text-sm text-brand-500 hover:text-brand-600 font-medium"
          >
            Voltar para Templates
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-white">
      <UnlayerEditor
        templateName={template.name}
        design={template.design_json || template.design}
        onSave={handleSave}
        onBack={handleBack}
      />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const UnlayerEditor = dynamic(() => import('@/components/email/email-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-white">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Carregando editor...</p>
      </div>
    </div>
  ),
})

interface Template {
  id: string
  name: string
  category: string
  design_json?: Record<string, unknown>
  html?: string
}

export default function EditTemplatePage() {
  const router = useRouter()
  const params = useParams()
  const templateId = params.id as string

  const [template, setTemplate] = useState<Template | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const res = await fetch(`/api/email/templates/${templateId}`)
        const data = await res.json()
        if (data.success && data.template) {
          setTemplate(data.template)
        } else {
          setError('Template não encontrado')
        }
      } catch (err) {
        setError('Erro ao carregar template')
      } finally {
        setIsLoading(false)
      }
    }

    if (templateId) fetchTemplate()
  }, [templateId])

  const handleSave = async (design: Record<string, unknown>, html: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_json: design, html }),
      })
      const data = await res.json()
      if (!data.success) {
        alert('Erro ao salvar: ' + (data.error || 'Erro desconhecido'))
        return false
      }
      return true
    } catch (err) {
      alert('Erro ao salvar template')
      return false
    }
  }

  const handleBack = () => {
    router.push('/email/templates')
  }

  if (isLoading) {
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
          <p className="text-gray-900 font-medium mb-2">{error || 'Template não encontrado'}</p>
          <button
            onClick={handleBack}
            className="text-sm text-brand-500 hover:text-brand-600"
          >
            Voltar para templates
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen">
      <UnlayerEditor
        design={template.design_json}
        onSave={handleSave}
        onBack={handleBack}
        templateName={template.name}
      />
    </div>
  )
}

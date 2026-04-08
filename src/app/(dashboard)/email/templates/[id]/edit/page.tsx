'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const WorderEditor = dynamic(() => import('@/components/email-builder/WorderEmailEditor'), { ssr: false })
const UnlayerEditor = dynamic(() => import('@/components/email/email-editor'), { ssr: false })
const GrapesJSEditor = dynamic(() => import('@/components/email/grapesjs-editor'), { ssr: false })

const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen bg-white">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      <p className="text-sm text-gray-500">Carregando editor...</p>
    </div>
  </div>
)

export default function EditTemplatePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = params.id as string
  const editorType = searchParams.get('editor') || 'worder'

  const [template, setTemplate] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`)
      if (!res.ok) throw new Error('Template não encontrado')
      const data = await res.json()
      const tmpl = data.template || data
      setTemplate(tmpl)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar template')
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => { fetchTemplate() }, [fetchTemplate])

  const handleSave = async (design: Record<string, any>, html: string) => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, design_json: design, html }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Erro ao salvar: ' + (err.error || 'Tente novamente'))
        return false
      }
      return true
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message)
      return false
    }
  }

  const handleBack = () => router.push('/email/templates')

  if (loading) return <LoadingScreen />
  if (error || !template) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center">
          <p className="text-base font-medium text-gray-500 mb-2">{error || 'Template não encontrado'}</p>
          <button onClick={handleBack} className="text-sm text-brand-500 hover:text-brand-600 font-medium">Voltar</button>
        </div>
      </div>
    )
  }

  const designData = template.design_json || template.design
  const editors = ['worder', 'unlayer', 'grapesjs']
  const nextEditor = editors[(editors.indexOf(editorType) + 1) % editors.length]

  return (
    <div className="fixed inset-0 z-50 bg-white">
      {/* Editor toggle */}
      <div className="absolute top-2.5 right-52 z-20">
        <a href={`/email/templates/${templateId}/edit?editor=${nextEditor}`}
          className="text-[10px] px-2 py-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 transition-colors">
          Trocar para {nextEditor === 'worder' ? 'Worder' : nextEditor === 'unlayer' ? 'Unlayer' : 'GrapesJS'}
        </a>
      </div>

      {editorType === 'grapesjs' ? (
        <GrapesJSEditor templateName={template.name || 'Template'} design={designData} onSave={handleSave} onBack={handleBack} />
      ) : editorType === 'unlayer' ? (
        <UnlayerEditor templateName={template.name || 'Template'} design={designData} onSave={handleSave} onBack={handleBack} />
      ) : (
        <WorderEditor templateName={template.name || 'Template'} design={designData} onSave={handleSave} onBack={handleBack} />
      )}
    </div>
  )
}

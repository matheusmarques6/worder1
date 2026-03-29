'use client'

import { useRef, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { mergeTags } from '@/lib/email/merge-tags'
import { ArrowLeft, Send, Save } from 'lucide-react'

const EmailEditorComponent = dynamic(() => import('react-email-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Carregando editor...</p>
      </div>
    </div>
  ),
})

interface EmailEditorProps {
  templateName?: string
  design?: Record<string, unknown>
  onSave: (design: Record<string, unknown>, html: string) => Promise<boolean>
  onBack?: () => void
  onTest?: () => void
}

export default function UnlayerEditor({ templateName, design, onSave, onBack, onTest }: EmailEditorProps) {
  const editorRef = useRef<any>(null)
  const [saving, setSaving] = useState(false)

  const onReady = useCallback(() => {
    if (design && editorRef.current?.editor) {
      editorRef.current.editor.loadDesign(design)
    }
  }, [design])

  const handleSave = useCallback(() => {
    if (!editorRef.current?.editor) return
    editorRef.current.editor.exportHtml(async (data: any) => {
      setSaving(true)
      try {
        await onSave(data.design, data.html)
      } finally {
        setSaving(false)
      }
    })
  }, [onSave])

  const unlayerMergeTags = Object.fromEntries(
    Object.entries(mergeTags).map(([key, tag]) => [
      key,
      { name: tag.name, value: tag.value, sample: tag.sample },
    ])
  )

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          )}
          {templateName && (
            <h1 className="text-lg font-semibold text-gray-900">{templateName}</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onTest && (
            <button
              onClick={onTest}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              Enviar Teste
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Template'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <EmailEditorComponent
          ref={editorRef}
          onReady={onReady}
          options={{
            mergeTags: unlayerMergeTags,
            locale: 'pt-BR',
            appearance: {
              theme: 'modern_light',
            },
            features: {
              textEditor: { spellChecker: true },
            },
            tools: {
              image: { enabled: true },
              button: { enabled: true },
              divider: { enabled: true },
              heading: { enabled: true },
              html: { enabled: true },
              menu: { enabled: true },
              social: { enabled: true },
              text: { enabled: true },
              timer: { enabled: true },
              video: { enabled: true },
            },
          }}
          style={{ minHeight: '100%' }}
        />
      </div>
    </div>
  )
}

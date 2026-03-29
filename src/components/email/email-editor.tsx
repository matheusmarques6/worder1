'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  Save,
  Send,
  Loader2,
  CheckCircle,
} from 'lucide-react'

const EmailEditor = dynamic(() => import('react-email-editor'), { ssr: false })

interface UnlayerEditorProps {
  templateName: string
  design?: Record<string, any>
  onSave: (design: Record<string, any>, html: string) => Promise<boolean>
  onBack: () => void
}

const mergeTags = {
  first_name: { name: 'Primeiro Nome', value: '{{first_name}}' },
  last_name: { name: 'Sobrenome', value: '{{last_name}}' },
  email: { name: 'Email', value: '{{email}}' },
  order_number: { name: 'Número do Pedido', value: '{{order_number}}' },
  order_total: { name: 'Total do Pedido', value: '{{order_total}}' },
  store_name: { name: 'Nome da Loja', value: '{{store_name}}' },
  tracking_url: { name: 'URL de Rastreio', value: '{{tracking_url}}' },
  coupon_code: { name: 'Código do Cupom', value: '{{coupon_code}}' },
  unsubscribe_url: { name: 'Link de Descadastro', value: '{{unsubscribe_url}}' },
}

export default function UnlayerEditor({ templateName, design, onSave, onBack }: UnlayerEditorProps) {
  const editorRef = useRef<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editorReady, setEditorReady] = useState(false)

  const onReady = useCallback(() => {
    setEditorReady(true)
    if (design && editorRef.current?.editor) {
      editorRef.current.editor.loadDesign(design)
    }
  }, [design])

  const handleSave = useCallback(async () => {
    if (!editorRef.current?.editor) return

    setSaving(true)
    setSaved(false)

    editorRef.current.editor.exportHtml(async (data: { design: any; html: string }) => {
      const success = await onSave(data.design, data.html)
      setSaving(false)
      if (success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    })
  }, [onSave])

  const handleSendTest = useCallback(() => {
    if (!editorRef.current?.editor) return

    editorRef.current.editor.exportHtml(async (data: { design: any; html: string }) => {
      try {
        await fetch('/api/email/templates/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: data.html }),
        })
      } catch (err) {
        console.error('Test send failed:', err)
      }
    })
  }, [])

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <h2 className="text-sm font-medium text-gray-900">{templateName}</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSendTest}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Send className="w-4 h-4" />
            Enviar Teste
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Salvo!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        {!editorReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
              <p className="text-sm text-gray-500">Carregando editor...</p>
            </div>
          </div>
        )}
        <EmailEditor
          ref={editorRef}
          onReady={onReady}
          minHeight="100%"
          options={{
            locale: 'pt-BR',
            appearance: {
              theme: 'modern_light',
              panels: {
                tools: { dock: 'left' },
              },
            },
            mergeTags,
            features: {
              textEditor: {
                spellChecker: true,
              },
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
        />
      </div>
    </div>
  )
}

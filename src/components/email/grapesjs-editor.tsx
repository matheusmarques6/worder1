'use client'

import React, { useState, useCallback, useRef } from 'react'
import { ArrowLeft, Save, Send, Loader2, CheckCircle } from 'lucide-react'

interface GrapesJSEditorProps {
  templateName: string
  design?: Record<string, any>
  onSave: (design: Record<string, any>, html: string) => Promise<boolean>
  onBack: () => void
}

export default function GrapesJSEmailEditor({ templateName, design, onSave, onBack }: GrapesJSEditorProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const editorRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const initEditor = useCallback(async () => {
    if (!containerRef.current || editorRef.current) return

    try {
      const grapesjs = (await import('grapesjs')).default
      const mjmlPlugin = (await import('grapesjs-mjml')).default

      const editor = grapesjs.init({
        container: containerRef.current,
        height: '100%',
        width: 'auto',
        storageManager: false,
        undoManager: { trackSelection: false },
        plugins: [mjmlPlugin],
        pluginsOpts: {
          [mjmlPlugin as any]: { resetDevices: false },
        },
        canvas: {
          styles: ['https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap'],
        },
      })

      // Register e-commerce blocks
      const bm = editor.BlockManager

      bm.add('product-grid', {
        label: 'Produtos',
        category: 'E-commerce',
        content: `<mj-section><mj-column>
          <mj-image src="https://placehold.co/260x260/F3F4F6/9CA3AF?text=Produto" />
          <mj-text align="center" font-weight="600">Nome do Produto</mj-text>
          <mj-text align="center" color="#F97316" font-weight="700">R$ XX,XX</mj-text>
          <mj-button background-color="#F97316" border-radius="6px">Comprar</mj-button>
        </mj-column><mj-column>
          <mj-image src="https://placehold.co/260x260/F3F4F6/9CA3AF?text=Produto" />
          <mj-text align="center" font-weight="600">Nome do Produto</mj-text>
          <mj-text align="center" color="#F97316" font-weight="700">R$ XX,XX</mj-text>
          <mj-button background-color="#F97316" border-radius="6px">Comprar</mj-button>
        </mj-column></mj-section>`,
        attributes: { class: 'fa fa-shopping-bag' },
      })

      bm.add('coupon-block', {
        label: 'Cupom',
        category: 'E-commerce',
        content: `<mj-section background-color="#FFF7ED"><mj-column>
          <mj-text align="center" font-size="14px" color="#9A3412">Use o código:</mj-text>
          <mj-text align="center" font-size="28px" font-weight="bold" color="#EA580C" letter-spacing="4px">CODIGO10</mj-text>
        </mj-column></mj-section>`,
        attributes: { class: 'fa fa-tag' },
      })

      bm.add('cart-block', {
        label: 'Carrinho',
        category: 'E-commerce',
        content: `<mj-section><mj-column>
          <mj-text font-size="22px" font-weight="bold" align="center">Você esqueceu algo!</mj-text>
          <mj-image src="https://placehold.co/200x200/F3F4F6/9CA3AF?text=Produto" width="200px" />
          <mj-button background-color="#F97316" border-radius="6px">Finalizar Compra</mj-button>
        </mj-column></mj-section>`,
        attributes: { class: 'fa fa-shopping-cart' },
      })

      bm.add('footer-unsub', {
        label: 'Footer',
        category: 'Layout',
        content: `<mj-section><mj-column>
          <mj-text align="center" font-size="11px" color="#9CA3AF">
            {{store_name}} · <a href="{{unsubscribe_url}}" style="color:#9CA3AF">Descadastrar-se</a>
          </mj-text>
        </mj-column></mj-section>`,
      })

      // Load saved design
      if (design && Object.keys(design).length > 0) {
        try {
          editor.loadProjectData(design)
        } catch (e) {
          console.warn('Failed to load GrapesJS design, starting fresh:', e)
        }
      }

      // Ctrl+S shortcut
      editor.Keymaps.add('save', 'ctrl+s', () => {
        handleSaveRef.current?.()
      })

      editorRef.current = editor
      setLoading(false)
    } catch (err) {
      console.error('GrapesJS init error:', err)
      setLoading(false)
    }
  }, [design])

  // Use ref for save handler to avoid stale closure in keymap
  const handleSaveRef = useRef<(() => void) | null>(null)

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    setSaving(true)
    try {
      let html = ''
      try {
        const result = editorRef.current.runCommand('mjml-code-to-html')
        html = result?.html || editorRef.current.getHtml()
      } catch {
        html = editorRef.current.getHtml()
      }
      const projectData = editorRef.current.getProjectData()
      const success = await onSave(projectData, html)
      if (success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message)
    }
    setSaving(false)
  }, [onSave])

  handleSaveRef.current = handleSave

  const handleSendTest = useCallback(async () => {
    if (!editorRef.current) return
    const email = prompt('Email para enviar teste:')
    if (!email || !email.includes('@')) return
    try {
      let html = ''
      try {
        const result = editorRef.current.runCommand('mjml-code-to-html')
        html = result?.html || editorRef.current.getHtml()
      } catch {
        html = editorRef.current.getHtml()
      }
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, testEmail: email, subject: templateName }),
      })
      alert(res.ok ? '✅ Teste enviado!' : '❌ Erro no envio')
    } catch {
      alert('❌ Erro ao enviar')
    }
  }, [templateName])

  // Init editor on mount
  React.useEffect(() => {
    const timer = setTimeout(initEditor, 100)
    return () => {
      clearTimeout(timer)
      if (editorRef.current) {
        try { editorRef.current.destroy() } catch {}
        editorRef.current = null
      }
    }
  }, [initEditor])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <h2 className="text-sm font-medium text-gray-900">{templateName}</h2>
          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">GrapesJS + MJML</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSendTest}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Send className="w-4 h-4" /> Enviar Teste
          </button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Editor Container */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
              <p className="text-sm text-gray-500">Carregando GrapesJS...</p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="h-full" />
      </div>
    </div>
  )
}

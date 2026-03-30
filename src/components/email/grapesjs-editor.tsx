'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
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
  const [ready, setReady] = useState(false)
  const editorRef = useRef<any>(null)
  const handleSaveRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let editor: any = null

    const init = async () => {
      const container = document.getElementById('gjs-editor')
      if (!container) return

      const grapesjs = (await import('grapesjs')).default
      const mjmlPlugin = (await import('grapesjs-mjml')).default

      // Inject GrapesJS base CSS
      if (!document.getElementById('gjs-css')) {
        const link = document.createElement('link')
        link.id = 'gjs-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/grapesjs@0.21.13/dist/css/grapes.min.css'
        document.head.appendChild(link)
      }

      // Inject light theme overrides
      if (!document.getElementById('gjs-light-theme')) {
        const style = document.createElement('style')
        style.id = 'gjs-light-theme'
        style.textContent = `
          .gjs-one-bg { background-color: #f9fafb !important; }
          .gjs-two-color { color: #374151 !important; }
          .gjs-three-bg { background-color: #ffffff !important; }
          .gjs-four-color, .gjs-four-color-h:hover { color: #F97316 !important; }
          .gjs-pn-panel { background-color: #ffffff !important; border-color: #e5e7eb !important; }
          .gjs-pn-views, .gjs-pn-views-container { background-color: #ffffff !important; }
          .gjs-pn-options { background-color: #ffffff !important; }
          .gjs-pn-commands { background-color: #ffffff !important; }
          .gjs-cv-canvas { background-color: #f3f4f6 !important; }
          .gjs-block { background-color: #ffffff !important; border: 1px solid #e5e7eb !important; border-radius: 8px !important; color: #374151 !important; min-height: 70px !important; }
          .gjs-block:hover { border-color: #F97316 !important; box-shadow: 0 1px 3px rgba(249,115,22,0.15) !important; }
          .gjs-block__media { color: #6b7280 !important; }
          .gjs-block-label { color: #374151 !important; font-size: 11px !important; }
          .gjs-blocks-cs { background-color: #ffffff !important; }
          .gjs-category-title, .gjs-layer-title, .gjs-block-category .gjs-title {
            background-color: #f9fafb !important; color: #111827 !important;
            border-bottom: 1px solid #e5e7eb !important; font-weight: 600 !important;
          }
          .gjs-sm-sector-title { background-color: #f9fafb !important; color: #111827 !important; border: 1px solid #e5e7eb !important; }
          .gjs-clm-tags { background-color: #ffffff !important; }
          .gjs-sm-property { color: #374151 !important; }
          .gjs-field { background-color: #ffffff !important; border: 1px solid #d1d5db !important; border-radius: 6px !important; color: #111827 !important; }
          .gjs-field input, .gjs-field select, .gjs-field textarea { color: #111827 !important; }
          .gjs-trt-trait { color: #374151 !important; }
          .gjs-trt-trait__wrp-title { color: #6b7280 !important; }
          .gjs-layer-name { color: #374151 !important; }
          .gjs-layers { background-color: #ffffff !important; }
          .gjs-pn-btn { color: #6b7280 !important; }
          .gjs-pn-btn:hover { color: #F97316 !important; }
          .gjs-pn-btn.gjs-pn-active { color: #F97316 !important; }
          .gjs-sm-sector .gjs-sm-property .gjs-sm-label { color: #6b7280 !important; }
          .gjs-nv-item { color: #374151 !important; }
          .gjs-editor-cont { background-color: #f3f4f6 !important; }
          .gjs-selected { outline-color: #F97316 !important; }
          .gjs-highlighter { outline-color: #F97316 !important; }
          #gjs-editor .gjs-frame-wrapper { background-color: #f3f4f6 !important; }
        `
        document.head.appendChild(style)
      }

      editor = grapesjs.init({
        container: '#gjs-editor',
        fromElement: false,
        height: '100%',
        width: 'auto',
        storageManager: false,
        undoManager: { trackSelection: false },
        plugins: [mjmlPlugin],
        pluginsOpts: {
          [mjmlPlugin as any]: {},
        },
        panels: { defaults: [] },
        blockManager: {
          appendTo: '#gjs-blocks',
        },
        styleManager: {
          appendTo: '#gjs-styles',
        },
        traitManager: {
          appendTo: '#gjs-traits',
        },
        layerManager: {
          appendTo: '#gjs-layers',
        },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Mobile', width: '375px', widthMedia: '480px' },
          ],
        },
      })

      // Add custom e-commerce blocks
      const bm = editor.BlockManager

      bm.add('product-grid-2col', {
        label: '🛍️ Produtos (2 col)',
        category: 'E-commerce',
        content: `<mj-section><mj-column>
          <mj-image src="https://placehold.co/280x280/F3F4F6/9CA3AF?text=Produto+1" />
          <mj-text align="center" font-weight="600" padding="8px 0 0">Nome do Produto</mj-text>
          <mj-text align="center" color="#F97316" font-weight="700" padding="4px 0 0" font-size="18px">R$ 89,90</mj-text>
          <mj-button background-color="#F97316" border-radius="8px" font-size="14px" inner-padding="12px 28px">Comprar</mj-button>
        </mj-column><mj-column>
          <mj-image src="https://placehold.co/280x280/F3F4F6/9CA3AF?text=Produto+2" />
          <mj-text align="center" font-weight="600" padding="8px 0 0">Nome do Produto</mj-text>
          <mj-text align="center" color="#F97316" font-weight="700" padding="4px 0 0" font-size="18px">R$ 79,90</mj-text>
          <mj-button background-color="#F97316" border-radius="8px" font-size="14px" inner-padding="12px 28px">Comprar</mj-button>
        </mj-column></mj-section>`,
      })

      bm.add('coupon-block', {
        label: '🏷️ Cupom',
        category: 'E-commerce',
        content: `<mj-section background-color="#FFF7ED" padding="30px 20px"><mj-column>
          <mj-text align="center" font-size="14px" color="#9A3412" padding="0">Use o cupom abaixo:</mj-text>
          <mj-text align="center" font-size="32px" font-weight="bold" color="#EA580C" letter-spacing="6px" padding="10px 0">BEMVINDO10</mj-text>
          <mj-text align="center" font-size="12px" color="#9CA3AF" padding="0">Válido por tempo limitado</mj-text>
        </mj-column></mj-section>`,
      })

      bm.add('cart-recovery', {
        label: '🛒 Carrinho Abandonado',
        category: 'E-commerce',
        content: `<mj-section><mj-column>
          <mj-text font-size="24px" font-weight="bold" align="center" padding="0 0 10px">Esqueceu algo?</mj-text>
          <mj-text align="center" color="#6B7280" padding="0 0 20px">Seus itens estão esperando por você</mj-text>
          <mj-image src="https://placehold.co/200x200/F3F4F6/9CA3AF?text=Produto" width="200px" />
          <mj-text align="center" font-weight="600" padding="10px 0 4px">{{cart_first_item}}</mj-text>
          <mj-text align="center" color="#F97316" font-weight="700" font-size="20px" padding="0">{{cart_first_item_price}}</mj-text>
          <mj-button background-color="#F97316" border-radius="8px" font-size="16px" inner-padding="14px 32px" href="{{cart_url}}">Finalizar Compra</mj-button>
        </mj-column></mj-section>`,
      })

      bm.add('hero-banner', {
        label: '🎯 Hero Banner',
        category: 'Layout',
        content: `<mj-section background-color="#F97316" padding="40px 20px"><mj-column>
          <mj-text align="center" color="white" font-size="28px" font-weight="bold" padding="0 0 10px">Título da Promoção</mj-text>
          <mj-text align="center" color="white" font-size="16px" padding="0 0 20px">Subtítulo com detalhes da oferta</mj-text>
          <mj-button background-color="white" color="#F97316" border-radius="8px" font-size="16px" font-weight="bold" inner-padding="14px 32px">Ver Ofertas</mj-button>
        </mj-column></mj-section>`,
      })

      bm.add('footer-unsub', {
        label: '📎 Footer + Descadastrar',
        category: 'Layout',
        content: `<mj-section padding="20px"><mj-column>
          <mj-divider border-color="#E5E7EB" />
          <mj-text align="center" font-size="11px" color="#9CA3AF" padding="10px 0">
            {{store_name}}<br/>
            <a href="{{unsubscribe_url}}" style="color:#9CA3AF;text-decoration:underline">Descadastrar-se</a> ·
            <a href="{{view_in_browser_url}}" style="color:#9CA3AF;text-decoration:underline">Ver no navegador</a>
          </mj-text>
        </mj-column></mj-section>`,
      })

      // Load saved design if exists
      if (design && typeof design === 'object' && Object.keys(design).length > 0) {
        try {
          editor.loadProjectData(design)
        } catch (e) {
          console.warn('Could not load saved design:', e)
        }
      }

      // Ctrl+S
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault()
          handleSaveRef.current?.()
        }
      })

      editorRef.current = editor
      setReady(true)
    }

    // Wait for DOM
    const timer = setTimeout(init, 200)

    return () => {
      clearTimeout(timer)
      if (editor) {
        try { editor.destroy() } catch {}
      }
      editorRef.current = null
    }
  }, [design])

  const handleSave = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return
    setSaving(true)
    try {
      let html = ''
      try {
        const result = ed.runCommand('mjml-code-to-html')
        html = result?.html || ''
      } catch {}
      if (!html) {
        try { html = ed.getHtml() } catch {}
      }
      const projectData = ed.getProjectData()
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
    const ed = editorRef.current
    if (!ed) return
    const email = prompt('Email para enviar teste:')
    if (!email || !email.includes('@')) return
    try {
      let html = ''
      try { html = ed.runCommand('mjml-code-to-html')?.html || '' } catch {}
      if (!html) try { html = ed.getHtml() } catch {}
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, testEmail: email, subject: templateName }),
      })
      alert(res.ok ? '✅ Teste enviado para ' + email : '❌ Erro no envio')
    } catch { alert('❌ Erro') }
  }, [templateName])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: 'white', zIndex: 20,
        flexShrink: 0, height: '52px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{ padding: '8px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ width: '1px', height: '20px', background: '#e5e7eb' }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{templateName}</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', background: '#d1fae5', color: '#065f46', borderRadius: '9999px', fontWeight: 500 }}>GrapesJS + MJML</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleSendTest} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
            border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            color: '#374151', background: 'white', cursor: 'pointer',
          }}>
            <Send size={16} /> Enviar Teste
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
            borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none',
            background: '#F97316', color: 'white', cursor: 'pointer', opacity: saving ? 0.5 : 1,
          }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle size={16} /> : <Save size={16} />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Editor Layout: sidebar-left | canvas | sidebar-right */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left sidebar - Blocks */}
        <div style={{
          width: '240px', borderRight: '1px solid #e5e7eb', background: '#ffffff',
          overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{ padding: '12px 12px 4px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Blocos
          </div>
          <div id="gjs-blocks" style={{ padding: '4px 8px' }} />
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          {!ready && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10, display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: 'white',
            }}>
              <div style={{ textAlign: 'center' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: '#F97316', margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', color: '#6b7280' }}>Carregando editor...</p>
              </div>
            </div>
          )}
          <div id="gjs-editor" style={{ height: '100%', width: '100%' }} />
        </div>

        {/* Right sidebar - Styles/Traits/Layers */}
        <div style={{
          width: '260px', borderLeft: '1px solid #e5e7eb', background: '#ffffff',
          overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{ padding: '12px 12px 4px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Estilos
          </div>
          <div id="gjs-styles" style={{ padding: '4px 8px' }} />
          <div style={{ padding: '12px 12px 4px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid #e5e7eb' }}>
            Propriedades
          </div>
          <div id="gjs-traits" style={{ padding: '4px 8px' }} />
          <div style={{ padding: '12px 12px 4px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid #e5e7eb' }}>
            Camadas
          </div>
          <div id="gjs-layers" style={{ padding: '4px 8px' }} />
        </div>
      </div>
    </div>
  )
}

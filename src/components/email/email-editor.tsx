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
    if (!editorRef.current?.editor) {
      alert('Editor não carregou. Recarregue a página.')
      return
    }

    const email = prompt('Digite o email para enviar o teste:')
    if (!email || !email.includes('@')) return

    editorRef.current.editor.exportHtml(async (data: { design: any; html: string }) => {
      try {
        const res = await fetch('/api/email/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html: data.html,
            testEmail: email,
            subject: templateName || 'Template',
          }),
        })
        if (res.ok) {
          alert('✅ Email de teste enviado para ' + email)
        } else {
          const err = await res.json().catch(() => ({}))
          alert('❌ Erro: ' + (err.error || 'Falha no envio'))
        }
      } catch (err: any) {
        alert('❌ Erro: ' + err.message)
      }
    })
  }, [templateName])

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
            customJS: [
              `
              unlayer.registerTool({
                name: 'product_feed',
                label: 'Produtos',
                icon: 'fa-shopping-bag',
                supportedDisplayModes: ['email'],
                options: {
                  productFeed: {
                    title: 'Feed de Produtos',
                    position: 1,
                    options: {
                      feedType: {
                        label: 'Tipo de Feed',
                        defaultValue: 'bestsellers',
                        widget: 'dropdown',
                        data: {
                          options: [
                            { label: 'Mais vendidos', value: 'bestsellers' },
                            { label: 'Mais novos', value: 'newest' },
                            { label: 'Aleatórios', value: 'random' },
                            { label: 'Visualizados recentemente', value: 'recently_viewed' },
                            { label: 'Carrinho abandonado', value: 'cart_items' },
                            { label: 'Recomendados', value: 'recommendations' },
                          ],
                        },
                      },
                      maxProducts: {
                        label: 'Quantidade',
                        defaultValue: 4,
                        widget: 'counter',
                        data: { min: 1, max: 12 },
                      },
                      columns: {
                        label: 'Colunas',
                        defaultValue: 2,
                        widget: 'dropdown',
                        data: {
                          options: [
                            { label: '1 coluna', value: 1 },
                            { label: '2 colunas', value: 2 },
                            { label: '3 colunas', value: 3 },
                            { label: '4 colunas', value: 4 },
                          ],
                        },
                      },
                    },
                  },
                  productDisplay: {
                    title: 'Exibição',
                    position: 2,
                    options: {
                      showPrice: { label: 'Mostrar preço', defaultValue: true, widget: 'toggle' },
                      showComparePrice: { label: 'Preço original', defaultValue: true, widget: 'toggle' },
                      showButton: { label: 'Mostrar botão', defaultValue: true, widget: 'toggle' },
                      buttonText: { label: 'Texto do botão', defaultValue: 'Comprar', widget: 'text' },
                    },
                  },
                },
                values: {},
                renderer: {
                  Viewer: unlayer.createViewer({
                    render: function(values) {
                      var cols = values.columns || 2;
                      var max = values.maxProducts || 4;
                      var rows = Math.ceil(max / cols);
                      var html = '<div style="padding:16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">';
                      for (var r = 0; r < rows; r++) {
                        html += '<tr>';
                        for (var c = 0; c < cols; c++) {
                          var idx = r * cols + c + 1;
                          if (idx > max) { html += '<td></td>'; continue; }
                          html += '<td width="' + (100/cols) + '%" style="padding:8px;vertical-align:top;text-align:center;">';
                          html += '<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#fff;">';
                          html += '<div style="background:#F3F4F6;height:180px;display:flex;align-items:center;justify-content:center;">';
                          html += '<span style="color:#9CA3AF;font-size:12px;">Produto ' + idx + '</span></div>';
                          html += '<div style="padding:12px;">';
                          html += '<p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Nome do produto</p>';
                          if (values.showPrice) {
                            if (values.showComparePrice) html += '<p style="margin:4px 0 0;font-size:12px;color:#9CA3AF;text-decoration:line-through;">R$ XX,XX</p>';
                            html += '<p style="margin:2px 0 0;font-size:16px;font-weight:700;color:#F97316;">R$ X,XX</p>';
                          }
                          if (values.showButton) {
                            html += '<a style="display:inline-block;margin-top:8px;padding:8px 20px;background:#F97316;color:white;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">' + (values.buttonText || 'Comprar') + '</a>';
                          }
                          html += '</div></div></td>';
                        }
                        html += '</tr>';
                      }
                      html += '</table>';
                      html += '<!-- WORDER_PRODUCT_BLOCK:' + (values.feedType || 'bestsellers') + ':' + max + ':' + cols + ':' + values.showPrice + ':' + values.showComparePrice + ':' + values.showButton + ':' + (values.buttonText || 'Comprar') + ' -->';
                      html += '</div>';
                      return html;
                    }
                  }),
                  exporters: {
                    email: function(values) {
                      var cols = values.columns || 2;
                      var max = values.maxProducts || 4;
                      var rows = Math.ceil(max / cols);
                      var html = '<div style="padding:16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">';
                      for (var r = 0; r < rows; r++) {
                        html += '<tr>';
                        for (var c = 0; c < cols; c++) {
                          var idx = r * cols + c + 1;
                          if (idx > max) { html += '<td></td>'; continue; }
                          html += '<td width="' + (100/cols) + '%" style="padding:8px;vertical-align:top;text-align:center;">';
                          html += '<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#fff;">';
                          html += '<div style="background:#F3F4F6;height:180px;"></div>';
                          html += '<div style="padding:12px;">';
                          html += '<p style="margin:0;font-size:14px;font-weight:600;color:#111827;">{{product_name}}</p>';
                          if (values.showPrice) html += '<p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#F97316;">{{product_price}}</p>';
                          if (values.showButton) html += '<a style="display:inline-block;margin-top:8px;padding:8px 20px;background:#F97316;color:white;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">' + (values.buttonText || 'Comprar') + '</a>';
                          html += '</div></div></td>';
                        }
                        html += '</tr>';
                      }
                      html += '</table>';
                      html += '<!-- WORDER_PRODUCT_BLOCK:' + (values.feedType || 'bestsellers') + ':' + max + ':' + cols + ':' + values.showPrice + ':' + values.showComparePrice + ':' + values.showButton + ':' + (values.buttonText || 'Comprar') + ' -->';
                      html += '</div>';
                      return html;
                    }
                  }
                },
              });
              `,
            ],
          }}
        />
      </div>
    </div>
  )
}

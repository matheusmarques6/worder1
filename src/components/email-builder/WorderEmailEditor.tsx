'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { ArrowLeft, Save, Send, Loader2, CheckCircle, Undo2, Redo2, Monitor, Smartphone, Plus } from 'lucide-react'
import { BlockPalette } from './panels/BlockPalette'
import { BlockPreview } from './blocks/BlockPreview'
import { BlockProperties } from './panels/BlockProperties'
import { BLOCK_DEFS, type EmailBlock, type EmailDocument } from './config/types'

interface WorderEmailEditorProps {
  templateName: string
  design?: EmailDocument | Record<string, any>
  onSave: (design: Record<string, any>, html: string) => Promise<boolean>
  onBack: () => void
}

function createId() {
  return 'b_' + Math.random().toString(36).substring(2, 9)
}

function createBlock(type: string): EmailBlock {
  const def = BLOCK_DEFS.find(d => d.type === type)
  return {
    id: createId(),
    type: type as EmailBlock['type'],
    props: { ...(def?.defaultProps || {}) },
  }
}

const DEFAULT_DOC: EmailDocument = {
  settings: { backgroundColor: '#f3f4f6', contentWidth: 600, fontFamily: "'DM Sans', Arial, sans-serif" },
  blocks: [],
}

function docToHtml(doc: EmailDocument): string {
  const w = doc.settings.contentWidth || 600
  const font = doc.settings.fontFamily || "'DM Sans', Arial, sans-serif"

  const blocksHtml = doc.blocks.map(b => {
    const p = b.props
    const pad = (p.padding ?? 20) + 'px'
    switch (b.type) {
      case 'text':
        return `<tr><td style="padding:${pad};color:${p.color || '#374151'};font-size:${p.fontSize || 15}px;text-align:${p.align || 'left'};font-family:${font};line-height:1.6;">${p.content || ''}</td></tr>`
      case 'image':
        const img = `<img src="${p.src}" alt="${p.alt || ''}" width="${p.width || w}" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:4px;" />`
        const imgContent = p.href ? `<a href="${p.href}" target="_blank">${img}</a>` : img
        return `<tr><td style="padding:${pad};text-align:center;">${imgContent}</td></tr>`
      case 'button':
        return `<tr><td style="padding:${pad};text-align:center;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;${p.fullWidth ? 'width:100%;' : ''}"><tr><td style="background-color:${p.bgColor || '#F97316'};border-radius:${p.borderRadius || 8}px;padding:12px 28px;text-align:center;"><a href="${p.href || '#'}" style="color:${p.textColor || '#fff'};font-size:${p.fontSize || 15}px;font-weight:bold;text-decoration:none;display:block;font-family:${font};">${p.text || 'Clique'}</a></td></tr></table></td></tr>`
      case 'divider':
        return `<tr><td style="padding:${pad};"><hr style="border:none;border-top:${p.thickness || 1}px solid ${p.color || '#E5E7EB'};margin:0;" /></td></tr>`
      case 'spacer':
        return `<tr><td style="height:${p.height || 32}px;line-height:${p.height || 32}px;font-size:1px;">&nbsp;</td></tr>`
      case 'columns':
        return `<tr><td style="padding:${pad};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="50%" style="padding-right:${(p.gap || 16) / 2}px;vertical-align:top;font-family:${font};font-size:14px;color:#374151;">${p.leftContent || ''}</td><td width="50%" style="padding-left:${(p.gap || 16) / 2}px;vertical-align:top;font-family:${font};font-size:14px;color:#374151;">${p.rightContent || ''}</td></tr></table></td></tr>`
      case 'html':
        return `<tr><td style="padding:${pad};">${p.code || ''}</td></tr>`
      case 'social': {
        const nets = [p.instagram && '📸', p.facebook && '📘', p.tiktok && '🎵', p.youtube && '▶️'].filter(Boolean)
        return `<tr><td style="padding:${pad};text-align:center;font-size:${p.iconSize || 28}px;">${nets.join('&nbsp;&nbsp;')}</td></tr>`
      }
      case 'header':
        return `<tr><td style="padding:${pad};background-color:${p.bgColor || '#fff'};text-align:center;"><img src="${p.logoSrc}" alt="Logo" width="${p.logoWidth || 160}" style="display:block;margin:0 auto;" /></td></tr>`
      case 'footer':
        return `<tr><td style="padding:${pad};background-color:${p.bgColor || '#F9FAFB'};text-align:center;font-size:12px;color:#9CA3AF;font-family:${font};">${p.text || ''}${p.showUnsubscribe ? '<br/><a href="{{unsubscribe_url}}" style="color:#9CA3AF;text-decoration:underline;">Descadastrar-se</a>' : ''}</td></tr>`
      case 'product-grid':
        return `<tr><td style="padding:${pad};"><!-- WORDER_PRODUCT_BLOCK:${p.feedType || 'bestsellers'}:${p.maxProducts || 4}:${p.columns || 2}:${p.showPrice}:true:${p.showButton}:${p.buttonText || 'Comprar'} --></td></tr>`
      case 'coupon':
        return `<tr><td style="padding:${pad};background-color:${p.bgColor || '#FFF7ED'};text-align:center;font-family:${font};"><p style="margin:0;font-size:14px;color:#9A3412;">${p.header || ''}</p><p style="margin:8px 0;font-size:${p.fontSize || 28}px;font-weight:bold;color:#EA580C;letter-spacing:4px;border:2px dashed ${p.borderColor || '#EA580C'};border-radius:8px;display:inline-block;padding:8px 24px;">${p.code || ''}</p><p style="margin:0;font-size:12px;color:#9CA3AF;">${p.footer || ''}</p></td></tr>`
      default:
        return ''
    }
  }).join('\n')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background-color:${doc.settings.backgroundColor};font-family:${font};"><center><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${w}" style="max-width:${w}px;margin:0 auto;background-color:#ffffff;">${blocksHtml}</table></center></body></html>`
}

export default function WorderEmailEditor({ templateName, design, onSave, onBack }: WorderEmailEditorProps) {
  const [doc, setDoc] = useState<EmailDocument>(() => {
    if (design && 'blocks' in design && Array.isArray((design as any).blocks)) return design as EmailDocument
    return { ...DEFAULT_DOC }
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [history, setHistory] = useState<EmailDocument[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [leftTab, setLeftTab] = useState<'blocks' | 'settings'>('blocks')
  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedBlock = doc.blocks.find(b => b.id === selectedId) || null

  // Push to history
  const pushHistory = useCallback((newDoc: EmailDocument) => {
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newDoc].slice(-50))
    setHistoryIndex(prev => prev + 1)
  }, [historyIndex])

  const updateDoc = useCallback((newDoc: EmailDocument) => {
    setDoc(newDoc)
    pushHistory(newDoc)
  }, [pushHistory])

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1)
      setDoc(history[historyIndex - 1])
    }
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1)
      setDoc(history[historyIndex + 1])
    }
  }, [history, historyIndex])

  // Block operations
  const addBlock = useCallback((type: string) => {
    const block = createBlock(type)
    const newDoc = { ...doc, blocks: [...doc.blocks, block] }
    updateDoc(newDoc)
    setSelectedId(block.id)
  }, [doc, updateDoc])

  const removeBlock = useCallback((id: string) => {
    updateDoc({ ...doc, blocks: doc.blocks.filter(b => b.id !== id) })
    if (selectedId === id) setSelectedId(null)
  }, [doc, selectedId, updateDoc])

  const cloneBlock = useCallback((id: string) => {
    const idx = doc.blocks.findIndex(b => b.id === id)
    if (idx === -1) return
    const clone = { ...doc.blocks[idx], id: createId(), props: { ...doc.blocks[idx].props } }
    const blocks = [...doc.blocks]
    blocks.splice(idx + 1, 0, clone)
    updateDoc({ ...doc, blocks })
    setSelectedId(clone.id)
  }, [doc, updateDoc])

  const moveBlock = useCallback((id: string, dir: 'up' | 'down') => {
    const idx = doc.blocks.findIndex(b => b.id === id)
    if (idx === -1) return
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= doc.blocks.length) return
    const blocks = [...doc.blocks]
    ;[blocks[idx], blocks[target]] = [blocks[target], blocks[idx]]
    updateDoc({ ...doc, blocks })
  }, [doc, updateDoc])

  const updateProp = useCallback((id: string, key: string, value: any) => {
    setDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === id ? { ...b, props: { ...b.props, [key]: value } } : b),
    }))
  }, [])

  // Drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('blockType')
    if (type) addBlock(type)
  }, [addBlock])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true)
    const html = docToHtml(doc)
    const success = await onSave(doc as any, html)
    setSaving(false)
    if (success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }, [doc, onSave])

  // Send test
  const handleSendTest = useCallback(async () => {
    const email = prompt('Email para enviar teste:')
    if (!email || !email.includes('@')) return
    const html = docToHtml(doc)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, testEmail: email, subject: templateName }),
      })
      alert(res.ok ? '✅ Teste enviado para ' + email : '❌ Erro no envio')
    } catch { alert('❌ Erro') }
  }, [doc, templateName])

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, undo, redo])

  const canvasWidth = device === 'mobile' ? 375 : doc.settings.contentWidth

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-[52px] bg-white border-b border-gray-200 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-900">{templateName}</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded font-bold tracking-wider">WORDER</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={undo} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="Desfazer (Ctrl+Z)"><Undo2 size={16} /></button>
          <button onClick={redo} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="Refazer (Ctrl+Shift+Z)"><Redo2 size={16} /></button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button onClick={() => setDevice('desktop')} className={`p-1.5 rounded ${device === 'desktop' ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-600'}`}><Monitor size={16} /></button>
          <button onClick={() => setDevice('mobile')} className={`p-1.5 rounded ${device === 'mobile' ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-600'}`}><Smartphone size={16} /></button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleSendTest} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50">
            <Send size={14} /> Enviar Teste
          </button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-[220px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="flex border-b border-gray-200">
            <button onClick={() => setLeftTab('blocks')} className={`flex-1 py-2.5 text-[11px] font-semibold ${leftTab === 'blocks' ? 'text-brand-600 border-b-2 border-brand-500' : 'text-gray-400'}`}>Blocos</button>
            <button onClick={() => setLeftTab('settings')} className={`flex-1 py-2.5 text-[11px] font-semibold ${leftTab === 'settings' ? 'text-brand-600 border-b-2 border-brand-500' : 'text-gray-400'}`}>Config</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'blocks' ? (
              <BlockPalette onAddBlock={addBlock} />
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Cor de Fundo</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={doc.settings.backgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, backgroundColor: e.target.value } }))}
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={doc.settings.backgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, backgroundColor: e.target.value } }))}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Largura (px)</label>
                  <input type="number" value={doc.settings.contentWidth} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, contentWidth: Number(e.target.value) } }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900" min={400} max={800} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: doc.settings.backgroundColor }} ref={canvasRef}
          onDrop={handleDrop} onDragOver={handleDragOver}>
          <div style={{ maxWidth: canvasWidth, margin: '24px auto', transition: 'max-width 0.3s' }}>
            <div style={{ backgroundColor: '#ffffff', minHeight: 200, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderRadius: 4 }}>
              {doc.blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Plus size={32} className="mb-3 text-gray-300" />
                  <p className="text-sm font-medium">Arraste blocos aqui</p>
                  <p className="text-xs mt-1">ou clique em um bloco na barra lateral</p>
                </div>
              ) : (
                doc.blocks.map((block, i) => (
                  <BlockPreview
                    key={block.id}
                    block={block}
                    selected={selectedId === block.id}
                    onSelect={() => setSelectedId(block.id)}
                    onMoveUp={() => moveBlock(block.id, 'up')}
                    onMoveDown={() => moveBlock(block.id, 'down')}
                    onClone={() => cloneBlock(block.id)}
                    onDelete={() => removeBlock(block.id)}
                    isFirst={i === 0}
                    isLast={i === doc.blocks.length - 1}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-[260px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          <div className="py-2.5 px-4 border-b border-gray-200">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              {selectedBlock ? `${BLOCK_DEFS.find(d => d.type === selectedBlock.type)?.label || selectedBlock.type}` : 'Propriedades'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedBlock ? (
              <BlockProperties block={selectedBlock} onChange={(key, value) => updateProp(selectedBlock.id, key, value)} />
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="text-xs">Selecione um bloco para editar suas propriedades</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

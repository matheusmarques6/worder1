'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, Save, Send, Loader2, CheckCircle, Undo2, Redo2, Monitor, Smartphone, Plus, Eye } from 'lucide-react'
import { BlockPalette } from './panels/BlockPalette'
import { BlockPreview } from './blocks/BlockPreview'
import { BlockProperties } from './panels/BlockProperties'
import { BLOCK_DEFS, createBlock, DEFAULT_DOCUMENT, type EmailBlock, type EmailDocument } from './config/types'
import { renderDocumentToHtml } from '@/lib/email/render-html'

interface WorderEmailEditorProps {
  templateName: string
  design?: EmailDocument | Record<string, any>
  onSave: (design: Record<string, any>, html: string) => Promise<boolean>
  onBack: () => void
}

export default function WorderEmailEditor({ templateName, design, onSave, onBack }: WorderEmailEditorProps) {
  // ── State ──
  const [doc, setDoc] = useState<EmailDocument>(() => {
    if (design && 'blocks' in design && Array.isArray((design as any).blocks)) return design as EmailDocument
    return JSON.parse(JSON.stringify(DEFAULT_DOCUMENT))
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [leftTab, setLeftTab] = useState<'content' | 'styles'>('content')
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Undo/Redo
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  const selectedBlock = doc.blocks.find(b => b.id === selectedId) || null

  const pushHistory = useCallback((newDoc: EmailDocument) => {
    const json = JSON.stringify(newDoc)
    setHistory(prev => [...prev.slice(0, historyIdx + 1), json].slice(-40))
    setHistoryIdx(prev => prev + 1)
  }, [historyIdx])

  const updateDoc = useCallback((newDoc: EmailDocument) => {
    setDoc(newDoc)
    pushHistory(newDoc)
  }, [pushHistory])

  const undo = useCallback(() => {
    if (historyIdx > 0) {
      setHistoryIdx(prev => prev - 1)
      setDoc(JSON.parse(history[historyIdx - 1]))
    }
  }, [history, historyIdx])

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(prev => prev + 1)
      setDoc(JSON.parse(history[historyIdx + 1]))
    }
  }, [history, historyIdx])

  // ── Block Operations ──
  const addBlock = useCallback((type: string) => {
    const block = createBlock(type as any)
    updateDoc({ ...doc, blocks: [...doc.blocks, block] })
    setSelectedId(block.id)
  }, [doc, updateDoc])

  const addSavedBlock = useCallback((blockJson: any) => {
    if (!blockJson) return
    const restored: EmailBlock = { ...blockJson, id: 'b_' + Math.random().toString(36).substring(2, 9) }
    updateDoc({ ...doc, blocks: [...doc.blocks, restored] })
    setSelectedId(restored.id)
  }, [doc, updateDoc])

  const removeBlock = useCallback((id: string) => {
    updateDoc({ ...doc, blocks: doc.blocks.filter(b => b.id !== id) })
    if (selectedId === id) setSelectedId(null)
  }, [doc, selectedId, updateDoc])

  const cloneBlock = useCallback((id: string) => {
    const idx = doc.blocks.findIndex(b => b.id === id)
    if (idx === -1) return
    const clone: EmailBlock = { ...JSON.parse(JSON.stringify(doc.blocks[idx])), id: 'b_' + Math.random().toString(36).substring(2, 9) }
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

  // ── Drag & Drop ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('blockType')
    if (type) addBlock(type)
  }, [addBlock])

  // ── Save ──
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const html = renderDocumentToHtml(doc)
      const success = await onSave(doc as any, html)
      if (success) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    } catch (err: any) { alert('Erro: ' + err.message) }
    setSaving(false)
  }, [doc, onSave])

  // ── Send Test ──
  const handleSendTest = useCallback(async () => {
    const email = prompt('Email para enviar teste:')
    if (!email || !email.includes('@')) return
    try {
      const html = renderDocumentToHtml(doc)
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, testEmail: email, subject: templateName }),
      })
      const data = await res.json()
      alert(res.ok ? '✅ Teste enviado para ' + email : '❌ ' + (data.error || 'Erro'))
    } catch (err: any) { alert('❌ ' + err.message) }
  }, [doc, templateName])

  // ── Preview ──
  const handlePreview = useCallback(() => {
    setPreviewHtml(renderDocumentToHtml(doc))
    setShowPreview(true)
  }, [doc])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      if (e.key === 'Delete' && selectedId) { removeBlock(selectedId) }
      if (e.key === 'Escape') { setSelectedId(null); setShowPreview(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, undo, redo, selectedId, removeBlock])

  const canvasWidth = device === 'mobile' ? 375 : doc.settings.contentWidth

  // ── Render ──
  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 h-[52px] bg-white border-b border-gray-200 flex-shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-900 truncate max-w-[200px]">{templateName}</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded font-bold tracking-wider hidden sm:inline">WORDER</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={historyIdx <= 0} className="p-1.5 text-gray-400 hover:text-gray-700 rounded disabled:opacity-30" title="Desfazer"><Undo2 size={15} /></button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 rounded disabled:opacity-30" title="Refazer"><Redo2 size={15} /></button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button onClick={() => setDevice('desktop')} className={`p-1.5 rounded transition-colors ${device === 'desktop' ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-700'}`}><Monitor size={15} /></button>
          <button onClick={() => setDevice('mobile')} className={`p-1.5 rounded transition-colors ${device === 'mobile' ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-700'}`}><Smartphone size={15} /></button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handlePreview} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Eye size={14} /> Preview
          </button>
          <button onClick={handleSendTest} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Send size={14} /> Teste
          </button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <div className="w-[240px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="flex border-b border-gray-200 flex-shrink-0">
            <button onClick={() => setLeftTab('content')} className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${leftTab === 'content' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Content</button>
            <button onClick={() => setLeftTab('styles')} className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${leftTab === 'styles' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Styles</button>
          </div>
          <div className="flex-1 overflow-hidden">
            {leftTab === 'content' ? (
              <BlockPalette onAddBlock={addBlock} onAddSavedBlock={addSavedBlock} />
            ) : (
              <div className="p-4 space-y-4 overflow-y-auto h-full">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Fundo do Email</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={doc.settings.backgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, backgroundColor: e.target.value } }))}
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={doc.settings.backgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, backgroundColor: e.target.value } }))}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Fundo do Conteúdo</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={doc.settings.contentBackgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, contentBackgroundColor: e.target.value } }))}
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={doc.settings.contentBackgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, contentBackgroundColor: e.target.value } }))}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Largura (px)</label>
                  <input type="number" value={doc.settings.contentWidth} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, contentWidth: Number(e.target.value) } }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900" min={400} max={800} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Raio da Borda</label>
                  <input type="number" value={doc.settings.borderRadius} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, borderRadius: Number(e.target.value) } }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900" min={0} max={24} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Fonte</label>
                  <select value={doc.settings.fontFamily} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, fontFamily: e.target.value } }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white">
                    <option value="'DM Sans', Arial, Helvetica, sans-serif">DM Sans</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="Georgia, Times, serif">Georgia</option>
                    <option value="'Courier New', Courier, monospace">Courier New</option>
                    <option value="Verdana, Geneva, sans-serif">Verdana</option>
                    <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: doc.settings.backgroundColor }}
          onDrop={handleDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onClick={() => setSelectedId(null)}>
          <div className="transition-all duration-300 mx-auto my-6" style={{ maxWidth: canvasWidth }}>
            <div style={{
              backgroundColor: doc.settings.contentBackgroundColor,
              borderRadius: doc.settings.borderRadius,
              minHeight: 200,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}>
              {doc.blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                  <Plus size={36} className="mb-3 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">Arraste blocos aqui</p>
                  <p className="text-xs mt-1 text-gray-400">ou clique em um bloco na barra lateral</p>
                </div>
              ) : (
                doc.blocks.map((block, i) => (
                  <div key={block.id} onClick={e => e.stopPropagation()}>
                    <BlockPreview
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
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-[280px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          <div className="py-2.5 px-4 border-b border-gray-200 flex-shrink-0">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {selectedBlock ? (BLOCK_DEFS.find(d => d.type === selectedBlock.type)?.label || selectedBlock.type) : 'Propriedades'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedBlock ? (
              <BlockProperties
                block={selectedBlock}
                onChange={(key, value) => updateProp(selectedBlock.id, key, value)}
                onSaveAsReusable={() => {
                  const name = prompt('Nome do bloco reutilizável:')
                  if (!name) return
                  fetch('/api/email/saved-blocks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, block_json: selectedBlock }),
                  }).then(() => alert('✅ Salvo!')).catch(() => alert('Erro'))
                }}
              />
            ) : (
              <div className="text-center py-16 text-gray-400">
                <span className="text-3xl block mb-3">🎨</span>
                <p className="text-xs font-medium text-gray-500">Selecione um bloco</p>
                <p className="text-[10px] text-gray-400 mt-1">para editar suas propriedades</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-[680px] w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-900">Preview do Email</span>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <iframe srcDoc={previewHtml} title="Preview" className="w-full border border-gray-200 rounded bg-white" style={{ height: 600 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

// =============================================================
// Biblioteca de mídia (modal) — usada pelo editor de e-mail e pelo
// editor de popup para escolher uma imagem.
//
// O que mudou e por quê:
//   • Vários arquivos de uma vez. O input não tinha `multiple` e o
//     drop lia só files[0]: quem soltava cinco imagens via uma subir.
//   • Soltar em QUALQUER aba funciona — antes só na aba Upload, e a
//     pessoa que estava na Biblioteca soltava a imagem e nada acontecia.
//   • Selecionar e excluir aqui mesmo. Antes só a página tinha excluir;
//     no modal, uma imagem errada ficava para sempre.
//   • Erros aparecem. Tipo recusado ou arquivo grande dizia nada.
//
// O contrato com quem usa não mudou: onSelect(url) + onClose().
// =============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  X, Upload, Loader2, Image as ImageIcon, Link, Search, Check,
  Trash2, CheckSquare, Square, AlertCircle,
} from 'lucide-react'
import { useStoreStore } from '@/stores'
import {
  uploadMediaFiles, deleteMediaFiles, summarizeUpload,
  MEDIA_ACCEPT, type MediaFile, type UploadFailure,
} from '@/lib/media/upload'

interface MediaLibraryModalProps {
  onSelect: (url: string) => void
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function MediaLibraryModal({ onSelect, onClose }: MediaLibraryModalProps) {
  const [tab, setTab] = useState<'upload' | 'library' | 'url'>('library')
  const [images, setImages] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [search, setSearch] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)

  // Upload em lote
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [lastFailures, setLastFailures] = useState<UploadFailure[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  // Recém-enviadas ganham destaque na biblioteca para a pessoa achar o
  // que acabou de subir no meio das antigas.
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set())

  // Seleção múltipla para excluir
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const { currentStore } = useStoreStore()

  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/content/media?${params}`)
      const data = await res.json()
      setImages(data.files || [])
    } catch {
      setNotice('Não foi possível carregar a biblioteca.')
    } finally {
      setLoading(false)
    }
  }, [currentStore?.id])

  useEffect(() => { fetchImages() }, [fetchImages])

  // Fecha no Esc — mas se estiver selecionando, o Esc primeiro sai do
  // modo de seleção, que é o que a pessoa espera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectMode) { setSelectMode(false); setSelected(new Set()) }
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode, onClose])

  /**
   * Sobe o lote. Com UM arquivo mantém o atalho de sempre — insere e
   * fecha. Com vários, cai na biblioteca com os novos em destaque para
   * a pessoa escolher qual entra no e-mail.
   */
  const handleFiles = useCallback(async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    setUploading(true)
    setNotice(null)
    setLastFailures([])
    setProgress({ done: 0, total: files.length })
    try {
      const result = await uploadMediaFiles(files, currentStore?.id, (done, total) =>
        setProgress({ done, total })
      )
      if (result.uploaded.length > 0) {
        setImages(prev => [...result.uploaded, ...prev])
        setRecentIds(new Set(result.uploaded.map(f => f.id)))
      }
      setLastFailures(result.failed)

      if (result.uploaded.length === 1 && result.failed.length === 0) {
        onSelect(result.uploaded[0].url)
        onClose()
        return
      }
      setNotice(summarizeUpload(result))
      if (result.uploaded.length > 0) setTab('library')
    } finally {
      setUploading(false)
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [currentStore?.id, onSelect, onClose])

  // Drop em qualquer lugar do modal. O contador de profundidade evita o
  // pisca-pisca do dragleave ao passar por elementos filhos.
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current += 1
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDeleteSelected = async () => {
    const alvo = images.filter(i => selected.has(i.id))
    if (alvo.length === 0) return
    const ok = confirm(
      alvo.length === 1
        ? `Excluir "${alvo[0].name}"? Esta ação não pode ser desfeita.`
        : `Excluir ${alvo.length} imagens? Esta ação não pode ser desfeita.`
    )
    if (!ok) return
    setDeleting(true)
    try {
      const { deleted, failed } = await deleteMediaFiles(alvo.map(i => i.storage_path))
      const apagados = new Set(deleted)
      setImages(prev => prev.filter(i => !apagados.has(i.storage_path)))
      setSelected(new Set())
      setSelectMode(false)
      setNotice(
        failed.length === 0
          ? `${deleted.length} ${deleted.length === 1 ? 'imagem excluída' : 'imagens excluídas'}`
          : `${deleted.length} excluídas · ${failed.length} não puderam ser excluídas`
      )
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteOne = async (img: MediaFile) => {
    if (!confirm(`Excluir "${img.name}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    try {
      const { deleted } = await deleteMediaFiles([img.storage_path])
      if (deleted.includes(img.storage_path)) {
        setImages(prev => prev.filter(i => i.id !== img.id))
        setNotice('Imagem excluída')
      } else {
        setNotice('Não foi possível excluir a imagem')
      }
    } finally {
      setDeleting(false)
    }
  }

  const filtered = useMemo(
    () => images.filter(img => !search || img.name?.toLowerCase().includes(search.toLowerCase())),
    [images, search]
  )

  const tabs = [
    { id: 'library' as const, label: 'Biblioteca', Icon: ImageIcon },
    { id: 'upload' as const, label: 'Upload', Icon: Upload },
    { id: 'url' as const, label: 'URL', Icon: Link },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        onDragEnter={onDragEnter}
        onDragOver={e => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="relative bg-white rounded-xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col"
      >
        {/* Camada de "solte aqui" — cobre o modal inteiro em qualquer aba */}
        {dragOver && !uploading && (
          <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-brand-500 bg-brand-50/90 flex flex-col items-center justify-center pointer-events-none">
            <Upload className="w-10 h-10 text-brand-500 mb-2" />
            <p className="text-sm font-semibold text-brand-700">Solte para enviar</p>
            <p className="text-xs text-brand-600 mt-0.5">Pode soltar várias de uma vez</p>
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Biblioteca de Mídia</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-gray-100 px-5">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Faixa de progresso / aviso */}
        {(uploading || notice || lastFailures.length > 0) && (
          <div className="px-5 pt-3 space-y-2">
            {uploading && progress && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
                Enviando {progress.done}/{progress.total}…
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {!uploading && notice && (
              <div className="flex items-center justify-between gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span>{notice}</span>
                <button onClick={() => { setNotice(null); setLastFailures([]) }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {!uploading && lastFailures.length > 0 && (
              <ul className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5">
                {lastFailures.slice(0, 5).map(f => (
                  <li key={f.name} className="flex items-start gap-1.5">
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span><strong className="font-medium">{f.name}</strong>: {f.reason}</span>
                  </li>
                ))}
                {lastFailures.length > 5 && <li>… e mais {lastFailures.length - 5}</li>}
              </ul>
            )}
          </div>
        )}

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Biblioteca */}
          {tab === 'library' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar imagens..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                  />
                </div>
                {images.length > 0 && (
                  selectMode ? (
                    <>
                      <button
                        onClick={() => setSelected(new Set(filtered.map(i => i.id)))}
                        className="px-2.5 py-2 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
                      >
                        Todas
                      </button>
                      <button
                        onClick={handleDeleteSelected}
                        disabled={selected.size === 0 || deleting}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40"
                      >
                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Excluir {selected.size > 0 ? `(${selected.size})` : ''}
                      </button>
                      <button
                        onClick={() => { setSelectMode(false); setSelected(new Set()) }}
                        className="px-2.5 py-2 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
                      title="Selecionar várias para excluir"
                    >
                      <CheckSquare className="w-3.5 h-3.5" /> Selecionar
                    </button>
                  )
                )}
              </div>

              {selectMode && (
                <p className="text-[11px] text-gray-500">
                  Clique nas imagens para marcar. {selected.size} {selected.size === 1 ? 'selecionada' : 'selecionadas'}.
                </p>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{search ? 'Nenhuma imagem encontrada' : 'Nenhuma imagem na biblioteca'}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {search ? 'Tente ajustar sua busca' : 'Solte imagens aqui ou use a aba Upload'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {filtered.map(img => {
                    const isSel = selected.has(img.id)
                    const isNew = recentIds.has(img.id)
                    return (
                      <div
                        key={img.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (selectMode) toggleSelected(img.id); else { onSelect(img.url); onClose() } }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (selectMode) toggleSelected(img.id); else { onSelect(img.url); onClose() } } }}
                        onMouseEnter={() => setHovered(img.id)}
                        onMouseLeave={() => setHovered(null)}
                        className={`group relative aspect-square rounded-lg border-2 overflow-hidden transition-all cursor-pointer outline-none focus:ring-2 focus:ring-brand-500/40 ${
                          isSel ? 'border-brand-500 ring-2 ring-brand-500/30'
                            : isNew ? 'border-emerald-400'
                            : 'border-gray-200 hover:border-brand-400'
                        }`}
                      >
                        <img src={img.url} alt={img.name || ''} className="w-full h-full object-cover" loading="lazy" />
                        <div className={`absolute inset-0 transition-colors ${isSel ? 'bg-brand-500/15' : 'bg-black/0 group-hover:bg-black/20'}`} />

                        {/* Rodapé com nome/tamanho */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[10px] text-white truncate font-medium">{img.name}</p>
                          <p className="text-[9px] text-white/70">{formatBytes(img.size)}</p>
                        </div>

                        {/* Marcador: seleção, "nova", ou o check de hover */}
                        {selectMode ? (
                          <div className={`absolute top-2 left-2 w-5 h-5 rounded flex items-center justify-center ${isSel ? 'bg-brand-500 text-white' : 'bg-white/90 text-gray-400'}`}>
                            {isSel ? <Check className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                          </div>
                        ) : (
                          <>
                            {isNew && (
                              <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white rounded">
                                nova
                              </span>
                            )}
                            {hovered === img.id && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            {/* Excluir uma só, sem entrar no modo de seleção */}
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteOne(img) }}
                              disabled={deleting}
                              title="Excluir"
                              className="absolute bottom-2 right-2 w-6 h-6 bg-white rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity shadow"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upload */}
          {tab === 'upload' && (
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto mb-2" />
                  {progress && <p className="text-xs text-gray-500">Enviando {progress.done}/{progress.total}…</p>}
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-1">Arraste uma ou várias imagens, ou clique para selecionar</p>
                  <p className="text-xs text-gray-400">JPG, PNG, GIF, WebP ou SVG — máximo 10 MB cada</p>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={MEDIA_ACCEPT}
                    className="hidden"
                    onChange={e => handleFiles(e.target.files)}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="inline-block mt-4 px-4 py-2 bg-brand-500 text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-brand-600 transition-colors"
                  >
                    Selecionar arquivos
                  </button>
                  <p className="text-[11px] text-gray-400 mt-3">
                    Uma imagem só entra direto no e-mail. Várias vão para a biblioteca, em destaque, para você escolher.
                  </p>
                </>
              )}
            </div>
          )}

          {/* URL */}
          {tab === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">URL da imagem</label>
                <input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                  placeholder="https://..."
                />
              </div>
              {urlInput && (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <img
                    src={urlInput}
                    alt="Preview"
                    className="w-full max-h-48 object-contain"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}
              <button
                onClick={() => { if (urlInput) { onSelect(urlInput); onClose() } }}
                disabled={!urlInput}
                className="w-full py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-brand-600 transition-colors"
              >
                Usar esta imagem
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Upload, Loader2, Image as ImageIcon, Link, Search, Check } from 'lucide-react'
import { useStoreStore } from '@/stores'

interface MediaLibraryModalProps {
  onSelect: (url: string) => void
  onClose: () => void
}

interface MediaFile {
  id: string
  name: string
  url: string
  size: number
  type: string
  created_at: string
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
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
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
    } finally {
      setLoading(false)
    }
  }, [currentStore?.id])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    if (currentStore?.id) form.append('store_id', currentStore.id)
    try {
      const res = await fetch('/api/content/media', { method: 'POST', body: form })
      const data = await res.json()
      if (data.url) {
        setImages(prev => [data, ...prev])
        // Auto-select and insert when uploading via drag-drop or upload tab
        onSelect(data.url)
        onClose()
      }
    } catch {} finally { setUploading(false) }
  }, [currentStore?.id, onSelect, onClose])

  const handleDropUpload = useCallback(async (file: File) => {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    if (currentStore?.id) form.append('store_id', currentStore.id)
    try {
      const res = await fetch('/api/content/media', { method: 'POST', body: form })
      const data = await res.json()
      if (data.url) {
        setImages(prev => [data, ...prev])
        // Don't auto-close when dropping on upload zone, let user pick
        setTab('library')
      }
    } catch {} finally { setUploading(false) }
  }, [currentStore?.id])

  const filtered = images.filter(img =>
    !search || img.name?.toLowerCase().includes(search.toLowerCase())
  )

  const tabs = [
    { id: 'library' as const, label: 'Biblioteca', Icon: ImageIcon },
    { id: 'upload' as const, label: 'Upload', Icon: Upload },
    { id: 'url' as const, label: 'URL', Icon: Link },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Biblioteca de Midia</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Library Tab */}
          {tab === 'library' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar imagens..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{search ? 'Nenhuma imagem encontrada' : 'Nenhuma imagem na biblioteca'}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {search ? 'Tente ajustar sua busca' : 'Faca upload primeiro na aba Upload'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {filtered.map(img => (
                    <button
                      key={img.id}
                      onClick={() => { onSelect(img.url); onClose() }}
                      onMouseEnter={() => setSelectedUrl(img.url)}
                      onMouseLeave={() => setSelectedUrl(null)}
                      className="group relative aspect-square rounded-lg border-2 border-gray-200 hover:border-brand-400 overflow-hidden transition-all"
                    >
                      <img src={img.url} alt={img.name || ''} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-white truncate font-medium">{img.name}</p>
                        <p className="text-[9px] text-white/70">{formatBytes(img.size)}</p>
                      </div>
                      {selectedUrl === img.url && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload Tab */}
          {tab === 'upload' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleDropUpload(f)
              }}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              {uploading ? (
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-1">Arraste uma imagem ou clique para selecionar</p>
                  <p className="text-xs text-gray-400">JPG, PNG, GIF, WebP ou SVG — Maximo 10MB</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f)
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="inline-block mt-4 px-4 py-2 bg-brand-500 text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-brand-600 transition-colors"
                  >
                    Selecionar arquivo
                  </button>
                </>
              )}
            </div>
          )}

          {/* URL Tab */}
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

'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Upload, Loader2, Image as ImageIcon, Link, Search } from 'lucide-react'

interface ImagePickerModalProps {
  onSelect: (url: string) => void
  onClose: () => void
}

export function ImagePickerModal({ onSelect, onClose }: ImagePickerModalProps) {
  const [tab, setTab] = useState<'upload' | 'gallery' | 'url'>('upload')
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<any[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    fetch('/api/images').then(r => r.json()).then(d => setImages(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/images/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (data.url) {
        onSelect(data.url)
      } else {
        alert(data.error || 'Erro no upload')
      }
    } catch (e: any) {
      alert(e.message)
    }
    setUploading(false)
  }, [onSelect])

  const tabs = [
    { id: 'upload' as const, label: 'Upload', Icon: Upload },
    { id: 'gallery' as const, label: 'Galeria', Icon: ImageIcon },
    { id: 'url' as const, label: 'URL', Icon: Link },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[580px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Selecionar Imagem</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-4 h-4" /></button>
        </div>

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

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'upload' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-gray-50'
              }`}>
              {uploading ? (
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-1">Arraste uma imagem ou clique para selecionar</p>
                  <p className="text-xs text-gray-400">JPG, PNG, GIF ou WebP — Máx 5MB</p>
                  <input type="file" accept="image/*" className="hidden" id="img-upload"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
                  <label htmlFor="img-upload"
                    className="inline-block mt-4 px-4 py-2 bg-brand-500 text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-brand-600 transition-colors">
                    Selecionar arquivo
                  </label>
                </>
              )}
            </div>
          )}

          {tab === 'gallery' && (
            <div>
              {images.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Nenhuma imagem ainda</p>
                  <p className="text-xs text-gray-400 mt-1">Faça upload primeiro</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img: any) => (
                    <button key={img.id || img.url} onClick={() => onSelect(img.url)}
                      className="border border-gray-200 rounded-lg overflow-hidden hover:border-brand-500 hover:shadow-md transition-all">
                      <div className="aspect-square bg-gray-50">
                        <img src={img.url} alt={img.file_name || ''} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[10px] text-gray-500 p-1.5 truncate">{img.file_name || 'Imagem'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">URL da imagem</label>
                <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                  placeholder="https://..." />
              </div>
              {urlInput && (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <img src={urlInput} alt="Preview" className="w-full max-h-48 object-contain"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                </div>
              )}
              <button onClick={() => urlInput && onSelect(urlInput)} disabled={!urlInput}
                className="w-full py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-brand-600 transition-colors">
                Usar esta imagem
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

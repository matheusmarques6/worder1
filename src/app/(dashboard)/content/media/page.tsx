'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Image as ImageIcon,
  Plus,
  MagnifyingGlass,
  Trash,
  Copy,
  Download,
  Upload,
  ArrowLeft,
  File,
  VideoCamera,
  FileText,
  FolderOpen,
  CheckCircle,
  DotsThree,
} from '@phosphor-icons/react'

const mediaItems = [
  { id: '1', name: 'banner-blackfriday.jpg', type: 'image', size: '245 KB', dimensions: '1200x628', folder: 'Campanhas', date: '12 Mar', uses: 8 },
  { id: '2', name: 'logo-loja.png', type: 'image', size: '42 KB', dimensions: '512x512', folder: 'Marca', date: '01 Mar', uses: 24 },
  { id: '3', name: 'produto-camiseta.jpg', type: 'image', size: '180 KB', dimensions: '800x800', folder: 'Produtos', date: '10 Mar', uses: 3 },
  { id: '4', name: 'video-lancamento.mp4', type: 'video', size: '4.2 MB', dimensions: '1080x1920', folder: 'Campanhas', date: '08 Mar', uses: 2 },
  { id: '5', name: 'banner-verao.jpg', type: 'image', size: '312 KB', dimensions: '1200x628', folder: 'Campanhas', date: '05 Mar', uses: 5 },
  { id: '6', name: 'icone-pix.png', type: 'image', size: '18 KB', dimensions: '256x256', folder: 'Ícones', date: '15 Feb', uses: 12 },
  { id: '7', name: 'catalogo-marco.pdf', type: 'document', size: '1.8 MB', dimensions: '—', folder: 'Documentos', date: '01 Mar', uses: 1 },
  { id: '8', name: 'hero-email.jpg', type: 'image', size: '520 KB', dimensions: '600x400', folder: 'E-mail', date: '09 Mar', uses: 6 },
  { id: '9', name: 'thumb-stories.jpg', type: 'image', size: '98 KB', dimensions: '1080x1920', folder: 'Social', date: '11 Mar', uses: 4 },
  { id: '10', name: 'produto-tenis.jpg', type: 'image', size: '210 KB', dimensions: '800x800', folder: 'Produtos', date: '07 Mar', uses: 7 },
  { id: '11', name: 'banner-cupom.jpg', type: 'image', size: '156 KB', dimensions: '1200x628', folder: 'Campanhas', date: '06 Mar', uses: 9 },
  { id: '12', name: 'depoimento-cliente.mp4', type: 'video', size: '8.1 MB', dimensions: '1920x1080', folder: 'Social', date: '04 Mar', uses: 1 },
]

const folders = ['Todos', 'Campanhas', 'Produtos', 'Marca', 'E-mail', 'Social', 'Ícones', 'Documentos']

const typeIcons: Record<string, React.ComponentType<any>> = {
  image: ImageIcon,
  video: VideoCamera,
  document: FileText,
}

const typeColors: Record<string, string> = {
  image: 'text-blue-400 bg-blue-500/10',
  video: 'text-purple-400 bg-purple-500/10',
  document: 'text-yellow-400 bg-yellow-500/10',
}

export default function MediaLibraryPage() {
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('Todos')
  const [selected, setSelected] = useState<string[]>([])

  const filtered = mediaItems.filter((m) => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase())
    const matchFolder = folder === 'Todos' || m.folder === folder
    return matchSearch && matchFolder
  })

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id])
  }

  const totalSize = mediaItems.reduce((acc, m) => {
    const num = parseFloat(m.size)
    return acc + (m.size.includes('MB') ? num * 1024 : num)
  }, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/content" className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <ImageIcon size={22} className="text-purple-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Biblioteca de Mídia</h1>
            <p className="text-sm text-zinc-400 mt-0.5">{mediaItems.length} arquivos · {(totalSize / 1024).toFixed(1)} MB usado</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors">
              <Trash size={14} />
              Excluir ({selected.length})
            </button>
          )}
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
            <Upload size={16} />
            Upload
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 flex flex-col items-center justify-center hover:border-zinc-600 transition-colors cursor-pointer">
        <Upload size={32} className="text-zinc-600 mb-2" />
        <p className="text-sm text-zinc-400">Arraste arquivos aqui ou clique para fazer upload</p>
        <p className="text-xs text-zinc-600 mt-1">PNG, JPG, GIF, MP4, PDF — Máximo 10MB</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar arquivos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                folder === f ? 'bg-[#F26B2A] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {filtered.map((item, i) => {
          const TypeIcon = typeIcons[item.type] || File
          const isSelected = selected.includes(item.id)
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.02 }}
              onClick={() => toggleSelect(item.id)}
              className={`bg-zinc-900/50 border rounded-xl overflow-hidden cursor-pointer group transition-all ${
                isSelected ? 'border-[#F26B2A] ring-1 ring-[#F26B2A]/30' : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="h-28 bg-zinc-800/30 flex items-center justify-center relative">
                <TypeIcon size={28} className="text-zinc-600" weight="duotone" />
                {isSelected && (
                  <div className="absolute top-2 left-2">
                    <CheckCircle size={18} className="text-[#F26B2A]" weight="fill" />
                  </div>
                )}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation() }} className="p-1 bg-zinc-800/80 rounded">
                    <DotsThree size={14} className="text-zinc-400" />
                  </button>
                </div>
                <span className={`absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColors[item.type]}`}>
                  {item.type === 'image' ? 'IMG' : item.type === 'video' ? 'VID' : 'DOC'}
                </span>
              </div>
              <div className="p-2.5">
                <p className="text-xs text-white truncate font-medium">{item.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-zinc-600">{item.size}</span>
                  <span className="text-[10px] text-zinc-600">{item.date}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

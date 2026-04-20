'use client'

import { useEffect, useState, useRef } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'

interface QuickReply {
  id: string
  shortcut: string
  title: string
  content: string
  category: string
}

interface QuickRepliesPickerProps {
  query: string
  organizationId: string
  onSelect: (reply: QuickReply) => void
  onClose: () => void
}

export function QuickRepliesPicker({ query, organizationId, onSelect, onClose }: QuickRepliesPickerProps) {
  const [items, setItems] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [organizationId])

  useEffect(() => { setSelectedIdx(0) }, [query])

  async function load() {
    try {
      const res = await fetch(`/api/whatsapp/inbox/quick-replies?organizationId=${organizationId}`)
      if (res.ok) { const d = await res.json(); setItems(d.data || []) }
    } catch { /* */ }
    setLoading(false)
  }

  const filtered = items.filter(r => {
    if (!query) return true
    const q = query.toLowerCase().replace(/^\//, '')
    return r.shortcut.toLowerCase().replace(/^\//, '').includes(q) ||
      r.title.toLowerCase().includes(q)
  })

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIdx]) onSelect(filtered[selectedIdx]) }
      else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [filtered, selectedIdx, onSelect, onClose])

  if (loading) {
    return (
      <div className="absolute bottom-full mb-2 left-0 w-80 bg-white border rounded-xl shadow-lg p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full mb-2 left-0 w-80 bg-white border rounded-xl shadow-lg p-4 text-center text-sm text-gray-500">
        Nenhuma resposta rapida encontrada
      </div>
    )
  }

  return (
    <div ref={containerRef} className="absolute bottom-full mb-2 left-0 w-80 bg-white border rounded-xl shadow-lg max-h-64 overflow-y-auto">
      <div className="p-2 border-b text-xs font-medium text-gray-500 flex items-center gap-1">
        <MessageSquare className="w-3.5 h-3.5" />
        Respostas rapidas
      </div>
      {filtered.map((r, i) => (
        <button
          key={r.id}
          onClick={() => onSelect(r)}
          onMouseEnter={() => setSelectedIdx(i)}
          className={`w-full text-left p-3 border-b last:border-b-0 transition-colors ${
            i === selectedIdx ? 'bg-primary-50' : 'hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <code className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">{r.shortcut}</code>
            <span className="text-sm font-medium">{r.title}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{r.content}</p>
        </button>
      ))}
    </div>
  )
}

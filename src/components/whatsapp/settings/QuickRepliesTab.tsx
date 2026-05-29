'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Plus, Trash2, Loader2 } from 'lucide-react'
import { authedFetch } from '@/lib/api/authed-fetch'

interface QuickReply {
  id: string
  shortcut: string
  title: string
  content: string
  category: string
  is_active: boolean
}

export function QuickRepliesTab({ organizationId }: { organizationId: string }) {
  const [items, setItems] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ shortcut: '', title: '', content: '', category: 'general' })

  useEffect(() => { load() }, [organizationId])

  async function load() {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/whatsapp/inbox/quick-replies`)
      if (res.ok) { const d = await res.json(); setItems(d.quickReplies || d.data || []) }
    } catch { /* */ }
    setLoading(false)
  }

  async function create() {
    if (!form.shortcut || !form.title || !form.content) return
    setSaving(true)
    try {
      const res = await authedFetch(`/api/whatsapp/inbox/quick-replies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, shortcut: form.shortcut.startsWith('/') ? form.shortcut : '/' + form.shortcut }),
      })
      if (res.ok) { await load(); setShowForm(false); setForm({ shortcut: '', title: '', content: '', category: 'general' }) }
    } catch { /* */ }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta resposta?')) return
    await authedFetch(`/api/whatsapp/inbox/quick-replies/${id}`, { method: 'DELETE' })
    setItems(items.filter(i => i.id !== id))
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Respostas rapidas</h3>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600">
          <Plus className="w-4 h-4" /> Criar
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border">
          <div className="flex gap-3">
            <input value={form.shortcut} onChange={e => setForm({ ...form, shortcut: e.target.value.replace(/\s/g, '') })} placeholder="/atalho" className="w-32 px-3 py-2 border rounded-lg text-sm font-mono" />
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titulo" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="greeting">Saudacao</option>
              <option value="support">Suporte</option>
              <option value="sales">Vendas</option>
              <option value="closing">Encerramento</option>
              <option value="general">Geral</option>
            </select>
          </div>
          <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Conteudo (use {nome}, {telefone}, {pedido})" className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-24" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button onClick={create} disabled={saving} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Nenhuma resposta rapida</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(r => (
            <div key={r.id} className="flex items-center justify-between p-4 bg-white border rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">{r.shortcut}</code>
                  <p className="font-medium text-sm">{r.title}</p>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{r.category}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">{r.content}</p>
              </div>
              <button onClick={() => remove(r.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

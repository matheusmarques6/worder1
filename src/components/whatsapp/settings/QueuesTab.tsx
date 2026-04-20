'use client'

import { useState, useEffect } from 'react'
import { Users, Plus, Trash2, Loader2 } from 'lucide-react'

interface Queue {
  id: string
  name: string
  color: string
  greeting_message?: string
  out_of_hours_message?: string
  is_active: boolean
  whatsapp_queue_agents?: { agent_id: string; is_active: boolean }[]
}

interface QueuesTabProps {
  organizationId: string
}

export function QueuesTab({ organizationId }: QueuesTabProps) {
  const [queues, setQueues] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', color: '#6366f1', greeting_message: '', out_of_hours_message: '' })

  useEffect(() => { loadQueues() }, [organizationId])

  async function loadQueues() {
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/queues?organizationId=${organizationId}`)
      if (res.ok) { const { data } = await res.json(); setQueues(data || []) }
    } catch { /* */ }
    setLoading(false)
  }

  async function createQueue() {
    if (!form.name) return
    setSaving(true)
    try {
      const res = await fetch(`/api/whatsapp/queues?organizationId=${organizationId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { const { data } = await res.json(); setQueues([...queues, data]); setShowForm(false); setForm({ name: '', color: '#6366f1', greeting_message: '', out_of_hours_message: '' }) }
    } catch { /* */ }
    setSaving(false)
  }

  async function deleteQueue(id: string) {
    if (!confirm('Excluir esta fila?')) return
    await fetch(`/api/whatsapp/queues/${id}?organizationId=${organizationId}`, { method: 'DELETE' })
    setQueues(queues.filter(q => q.id !== id))
  }

  async function toggleActive(q: Queue) {
    await fetch(`/api/whatsapp/queues/${q.id}?organizationId=${organizationId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !q.is_active }),
    })
    setQueues(queues.map(x => x.id === q.id ? { ...x, is_active: !x.is_active } : x))
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Filas de Atendimento</h3>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600">
          <Plus className="w-4 h-4" /> Criar fila
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border">
          <div className="flex gap-3">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome da fila" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
            <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
          </div>
          <textarea value={form.greeting_message} onChange={e => setForm({ ...form, greeting_message: e.target.value })} placeholder="Mensagem de saudacao (opcional)" className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-16" />
          <textarea value={form.out_of_hours_message} onChange={e => setForm({ ...form, out_of_hours_message: e.target.value })} placeholder="Mensagem fora do horario (opcional)" className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-16" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button onClick={createQueue} disabled={saving || !form.name} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Criar
            </button>
          </div>
        </div>
      )}

      {queues.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Nenhuma fila configurada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queues.map(q => (
            <div key={q.id} className="flex items-center justify-between p-4 bg-white border rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: q.color }} />
                <div>
                  <p className="font-medium text-sm">{q.name}</p>
                  <p className="text-xs text-gray-500">{q.whatsapp_queue_agents?.length || 0} agentes</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(q)} className={`px-3 py-1 text-xs rounded-full ${q.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {q.is_active ? 'Ativo' : 'Inativo'}
                </button>
                <button onClick={() => deleteQueue(q.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

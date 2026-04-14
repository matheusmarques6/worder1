'use client'

import { useState, useEffect } from 'react'
import { Bot, Plus, Trash2, Loader2 } from 'lucide-react'

interface AIAgent {
  id: string
  name: string
  agent_type: 'sales' | 'support' | 'post_sale'
  model: string
  system_prompt: string
  knowledge_base?: string
  temperature: number
  max_tokens: number
  handoff_keywords: string[]
  mode: 'auto' | 'copilot' | 'both'
  is_active: boolean
}

export function AIAgentsTab({ organizationId }: { organizationId: string }) {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', agent_type: 'support', model: 'gpt-4o-mini',
    system_prompt: 'Voce e um assistente de atendimento. Responda de forma clara e profissional.',
    knowledge_base: '', temperature: 0.7, max_tokens: 500,
    handoff_keywords: '', mode: 'auto',
  })

  useEffect(() => { load() }, [organizationId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/ai-agents?organizationId=${organizationId}`)
      if (res.ok) { const d = await res.json(); setAgents(d.data || []) }
    } catch { /* */ }
    setLoading(false)
  }

  async function create() {
    if (!form.name || !form.system_prompt) return
    setSaving(true)
    try {
      const res = await fetch(`/api/whatsapp/ai-agents?organizationId=${organizationId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, handoff_keywords: form.handoff_keywords.split(',').map(s => s.trim()).filter(Boolean) }),
      })
      if (res.ok) { await load(); setShowForm(false) }
    } catch { /* */ }
    setSaving(false)
  }

  async function toggleActive(a: AIAgent) {
    await fetch(`/api/whatsapp/ai-agents/${a.id}?organizationId=${organizationId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !a.is_active }),
    })
    setAgents(agents.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x))
  }

  async function remove(id: string) {
    if (!confirm('Excluir este agente?')) return
    await fetch(`/api/whatsapp/ai-agents/${id}?organizationId=${organizationId}`, { method: 'DELETE' })
    setAgents(agents.filter(a => a.id !== id))
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Agentes de IA</h3>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600">
          <Plus className="w-4 h-4" /> Criar agente IA
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome do agente" className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.agent_type} onChange={e => setForm({ ...form, agent_type: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="sales">Vendas</option>
              <option value="support">Suporte</option>
              <option value="post_sale">Pos-venda</option>
            </select>
            <select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="gpt-4o-mini">GPT-4o Mini (rapido e barato)</option>
              <option value="gpt-4o">GPT-4o (mais preciso)</option>
            </select>
            <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="auto">Responder automaticamente</option>
              <option value="copilot">Sugerir ao agente (copilot)</option>
              <option value="both">Ambos</option>
            </select>
          </div>
          <textarea value={form.system_prompt} onChange={e => setForm({ ...form, system_prompt: e.target.value })} placeholder="System prompt..." className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-24" />
          <textarea value={form.knowledge_base} onChange={e => setForm({ ...form, knowledge_base: e.target.value })} placeholder="Base de conhecimento / FAQ..." className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-20" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Temperatura: {form.temperature}</label>
              <input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })} className="w-full" />
            </div>
            <input type="number" value={form.max_tokens} onChange={e => setForm({ ...form, max_tokens: parseInt(e.target.value) || 500 })} placeholder="Max tokens" className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <input value={form.handoff_keywords} onChange={e => setForm({ ...form, handoff_keywords: e.target.value })} placeholder="Keywords de handoff (separadas por virgula): atendente, humano, falar com pessoa" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button onClick={create} disabled={saving} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Criar
            </button>
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Bot className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Nenhum agente IA configurado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map(a => (
            <div key={a.id} className="flex items-center justify-between p-4 bg-white border rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">{a.name}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-gray-100 rounded capitalize">{a.agent_type}</span>
                    <span>{a.model}</span>
                    <span>{a.mode}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(a)} className={`px-3 py-1 text-xs rounded-full ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {a.is_active ? 'Ativo' : 'Inativo'}
                </button>
                <button onClick={() => remove(a.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

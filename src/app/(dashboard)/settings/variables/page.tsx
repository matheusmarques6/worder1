'use client'

// =============================================
// /settings/variables
//
// Variable mapping cockpit. Two stacked sections:
//
// 1. Auto-discovered variables — pulls /automations/variables/discover
//    for a chosen trigger type and lists every leaf path Shopify is
//    sending us in recent events. Click a path → it's copied to
//    clipboard ready to paste into a flow template.
//
// 2. Custom variables — merchant-defined shortcuts. Friendly name +
//    description + path expression. Used in flow templates as
//    {{ custom.<key> }}. Mostly for non-technical marketers who want
//    "Customer Name" in the variable picker without remembering the
//    full lodash path.
// =============================================

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Copy, CheckCircle2, ArrowLeft, Edit2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface DiscoveredPath {
  path: string
  sample: any
  type: string
}

interface CustomVariable {
  id: string
  variable_key: string
  label: string
  description: string | null
  category: string
  variable_type: string
  path: string
  fallback_path: string | null
  default_value: string | null
  applicable_triggers: string[] | null
  enabled: boolean
}

const TRIGGER_OPTIONS = [
  { value: 'trigger_order', label: 'Pedido criado' },
  { value: 'trigger_checkout_abandoned', label: 'Checkout abandonado' },
  { value: 'trigger_checkout_completed', label: 'Checkout completado' },
  { value: 'trigger_fulfilled_order', label: 'Pedido enviado' },
  { value: 'trigger_cancelled_order', label: 'Pedido cancelado' },
  { value: 'trigger_refunded_order', label: 'Pedido reembolsado' },
  { value: 'trigger_viewed_product', label: 'Visualizou produto' },
  { value: 'trigger_added_to_cart', label: 'Adicionou ao carrinho' },
  { value: 'trigger_active_on_site', label: 'Active on site' },
  { value: 'trigger_browse_abandoned', label: 'Navegação abandonada' },
  { value: 'trigger_back_in_stock', label: 'Voltou em estoque' },
  { value: 'trigger_form_submitted', label: 'Formulário enviado' },
]

export default function VariablesPage() {
  const router = useRouter()
  const [activeTrigger, setActiveTrigger] = useState('trigger_order')
  const [discovered, setDiscovered] = useState<DiscoveredPath[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [eventCount, setEventCount] = useState(0)
  const [customVars, setCustomVars] = useState<CustomVariable[]>([])
  const [loadingCustom, setLoadingCustom] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<CustomVariable | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  async function loadDiscovery(trigger: string) {
    setDiscovering(true)
    try {
      const res = await fetch(`/api/automations/variables/discover?triggerType=${trigger}`)
      if (res.ok) {
        const j = await res.json()
        setDiscovered(j.paths || [])
        setEventCount(j.event_count_sampled || 0)
      } else {
        setDiscovered([])
      }
    } finally {
      setDiscovering(false)
    }
  }

  async function loadCustom() {
    setLoadingCustom(true)
    try {
      const res = await fetch('/api/automations/variables/custom')
      if (res.ok) {
        const j = await res.json()
        setCustomVars(j.variables || [])
      }
    } finally {
      setLoadingCustom(false)
    }
  }

  useEffect(() => {
    loadDiscovery(activeTrigger)
  }, [activeTrigger])

  useEffect(() => {
    loadCustom()
  }, [])

  async function copyVar(path: string) {
    try {
      await navigator.clipboard.writeText(`{{ ${path} }}`)
      setCopiedPath(path)
      setTimeout(() => setCopiedPath(null), 1500)
    } catch {}
  }

  async function deleteCustom(id: string) {
    if (!confirm('Remover esta variável?')) return
    await fetch('/api/automations/variables/custom', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadCustom()
  }

  const filteredDiscovered = discovered.filter((d) =>
    !filter || d.path.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Variáveis</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Veja todos os campos disponíveis nos eventos e crie atalhos personalizados pra usar nos fluxos.
          </p>
        </div>
      </div>

      {/* SECTION 1: Auto-discovered */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[13px] font-semibold text-gray-900">Variáveis disponíveis no payload</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Detectadas automaticamente nos últimos 20 eventos de cada tipo. Clique pra copiar a sintaxe e cole no editor de email/automação.
          </p>
        </div>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <select
            value={activeTrigger}
            onChange={(e) => setActiveTrigger(e.target.value)}
            className="px-3 py-1.5 text-[12.5px] border border-gray-200 rounded-md bg-white focus:outline-none focus:border-zinc-900"
          >
            {TRIGGER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar paths..."
            className="flex-1 px-3 py-1.5 text-[12.5px] border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
          />
          <span className="text-[11px] text-gray-500">{eventCount} eventos amostrados · {filteredDiscovered.length} paths</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {discovering ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : filteredDiscovered.length === 0 ? (
            <p className="text-[12px] text-gray-500 px-4 py-6 text-center">
              Nenhum evento encontrado pra esse trigger. Aguarde alguns eventos chegarem ou troque o tipo.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredDiscovered.map((d) => (
                <button
                  key={d.path}
                  onClick={() => copyVar(d.path)}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-50 text-left"
                >
                  <code className="text-[11.5px] font-mono text-blue-700 flex-shrink-0 max-w-[40%] truncate">{`{{ ${d.path} }}`}</code>
                  <span className="text-[10.5px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono uppercase tracking-wide flex-shrink-0">{d.type}</span>
                  <span className="text-[11px] text-gray-500 truncate flex-1">
                    {d.sample === null ? <em>null</em> : typeof d.sample === 'object' ? JSON.stringify(d.sample).slice(0, 80) : String(d.sample).slice(0, 80)}
                  </span>
                  {copiedPath === d.path ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: Custom variables */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-gray-900">Variáveis personalizadas</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Atalhos com nome amigável. Use no editor como <code className="font-mono">{'{{ custom.minha_variavel }}'}</code>.
            </p>
          </div>
          <button
            onClick={() => { setEditing(null); setShowCreate(true) }}
            className="px-3 py-1.5 text-[12px] font-semibold bg-zinc-900 text-white rounded-md hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Nova
          </button>
        </div>
        {loadingCustom ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : customVars.length === 0 ? (
          <p className="text-[12px] text-gray-500 px-4 py-6 text-center">
            Nenhuma variável personalizada. Comece criando atalhos como "Customer Full Name" → <code className="font-mono">trigger.raw.customer.first_name</code>.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {customVars.map((v) => (
              <div key={v.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-gray-900">
                    {v.label}
                    <code className="ml-2 text-[10.5px] font-mono text-blue-700">{`{{ custom.${v.variable_key} }}`}</code>
                  </p>
                  <p className="text-[11px] text-gray-500 font-mono truncate">
                    {v.path}{v.fallback_path && ` → ${v.fallback_path}`}{v.default_value && ` || "${v.default_value}"`}
                  </p>
                </div>
                <button onClick={() => { setEditing(v); setShowCreate(true) }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteCustom(v.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateOrEditCustomVarModal
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={() => { setShowCreate(false); setEditing(null); loadCustom() }}
          existing={editing}
        />
      )}
    </div>
  )
}

function CreateOrEditCustomVarModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: CustomVariable | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    label: existing?.label || '',
    variable_key: existing?.variable_key || '',
    description: existing?.description || '',
    category: existing?.category || 'custom',
    variable_type: existing?.variable_type || 'string',
    path: existing?.path || '',
    fallback_path: existing?.fallback_path || '',
    default_value: existing?.default_value || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null)
    try {
      const method = existing ? 'PATCH' : 'POST'
      const body: any = { ...form }
      if (existing) body.id = existing.id
      const res = await fetch('/api/automations/variables/custom', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        setError(j.error || 'Falhou.')
      } else {
        onSaved()
      }
    } catch (e: any) {
      setError(e?.message || 'Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[15px] font-semibold text-gray-900">
          {existing ? 'Editar variável' : 'Nova variável personalizada'}
        </h2>
        <div className="space-y-2.5">
          <div>
            <label className="text-[11.5px] font-medium text-gray-700 block mb-1">Nome amigável</label>
            <input
              type="text" value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Customer Full Name"
              className="w-full px-3 py-2 text-[12.5px] border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
            />
          </div>
          <div>
            <label className="text-[11.5px] font-medium text-gray-700 block mb-1">
              Chave de uso <code className="font-mono text-[10.5px] text-gray-500">{'{{ custom.<chave> }}'}</code>
            </label>
            <input
              type="text" value={form.variable_key}
              onChange={(e) => setForm({ ...form, variable_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="customer_full_name"
              className="w-full px-3 py-2 text-[12.5px] font-mono border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
            />
          </div>
          <div>
            <label className="text-[11.5px] font-medium text-gray-700 block mb-1">
              Path principal <span className="text-gray-400">(lodash, ex: trigger.raw.customer.first_name)</span>
            </label>
            <input
              type="text" value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              placeholder="trigger.raw.customer.first_name"
              className="w-full px-3 py-2 text-[12.5px] font-mono border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11.5px] font-medium text-gray-700 block mb-1">Path fallback (opcional)</label>
              <input
                type="text" value={form.fallback_path}
                onChange={(e) => setForm({ ...form, fallback_path: e.target.value })}
                placeholder="trigger.CustomerFirstName"
                className="w-full px-3 py-2 text-[12.5px] font-mono border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-medium text-gray-700 block mb-1">Valor padrão (opcional)</label>
              <input
                type="text" value={form.default_value}
                onChange={(e) => setForm({ ...form, default_value: e.target.value })}
                placeholder="cliente"
                className="w-full px-3 py-2 text-[12.5px] border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11.5px] font-medium text-gray-700 block mb-1">Tipo</label>
              <select
                value={form.variable_type}
                onChange={(e) => setForm({ ...form, variable_type: e.target.value })}
                className="w-full px-3 py-2 text-[12.5px] border border-gray-200 rounded-md bg-white focus:outline-none focus:border-zinc-900"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="currency">currency</option>
                <option value="date">date</option>
                <option value="datetime">datetime</option>
                <option value="boolean">boolean</option>
                <option value="array">array</option>
                <option value="object">object</option>
              </select>
            </div>
            <div>
              <label className="text-[11.5px] font-medium text-gray-700 block mb-1">Categoria</label>
              <input
                type="text" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 text-[12.5px] border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>
          <div>
            <label className="text-[11.5px] font-medium text-gray-700 block mb-1">Descrição (opcional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-[12.5px] border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900 resize-none"
            />
          </div>
        </div>
        {error && <p className="text-[11.5px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-100 rounded">Cancelar</button>
          <button
            onClick={save}
            disabled={saving || !form.label || !form.path}
            className="px-3 py-1.5 text-[12px] font-semibold bg-zinc-900 text-white rounded hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {existing ? 'Salvar' : 'Criar variável'}
          </button>
        </div>
      </div>
    </div>
  )
}

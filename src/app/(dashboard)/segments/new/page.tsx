'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, useStoreStore } from '@/stores'
import {
  X, Save, Loader2, Users, Plus, Trash2, Info, AlertCircle, CheckCircle2,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────
// Field catalog (Omnisend-style: grouped by category)
// ──────────────────────────────────────────────────────────
type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select'

interface FieldDef {
  name: string
  label: string
  type: FieldType
  options?: Array<{ value: string; label: string }>
  group: 'identity' | 'engagement' | 'commerce' | 'lifecycle'
}

const FIELDS: FieldDef[] = [
  // Identity
  { name: 'email', label: 'Email', type: 'text', group: 'identity' },
  { name: 'first_name', label: 'Nome', type: 'text', group: 'identity' },
  { name: 'last_name', label: 'Sobrenome', type: 'text', group: 'identity' },
  { name: 'phone', label: 'Telefone', type: 'text', group: 'identity' },
  { name: 'source', label: 'Origem', type: 'text', group: 'identity' },

  // Engagement / consent
  {
    name: 'email_consent',
    label: 'Consentimento de email',
    type: 'select',
    options: [
      { value: 'subscribed', label: 'Inscrito' },
      { value: 'unsubscribed', label: 'Não inscrito' },
      { value: 'pending', label: 'Pendente' },
    ],
    group: 'engagement',
  },
  {
    name: 'sms_consent',
    label: 'Consentimento de SMS',
    type: 'select',
    options: [
      { value: 'subscribed', label: 'Inscrito' },
      { value: 'unsubscribed', label: 'Não inscrito' },
    ],
    group: 'engagement',
  },
  { name: 'tags', label: 'Tags (contém)', type: 'text', group: 'engagement' },
  { name: 'last_active_at', label: 'Última atividade', type: 'date', group: 'engagement' },

  // Commerce
  { name: 'total_orders', label: 'Total de pedidos', type: 'number', group: 'commerce' },
  { name: 'total_spent', label: 'Total gasto (R$)', type: 'number', group: 'commerce' },
  { name: 'average_order_value', label: 'Ticket médio (R$)', type: 'number', group: 'commerce' },
  { name: 'days_since_last_order', label: 'Dias desde o último pedido', type: 'number', group: 'commerce' },

  // Lifecycle
  {
    name: 'lifecycle_stage',
    label: 'Estágio do ciclo de vida',
    type: 'select',
    options: [
      { value: 'new', label: 'Novo' },
      { value: 'active', label: 'Ativo' },
      { value: 'at_risk', label: 'Em risco' },
      { value: 'churned', label: 'Perdido' },
      { value: 'vip', label: 'VIP' },
    ],
    group: 'lifecycle',
  },
  { name: 'churn_risk', label: 'Risco de churn (0-1)', type: 'number', group: 'lifecycle' },
  { name: 'created_at', label: 'Data de cadastro', type: 'date', group: 'lifecycle' },
]

const GROUP_LABELS: Record<FieldDef['group'], string> = {
  identity: 'Identidade',
  engagement: 'Engajamento',
  commerce: 'Compras',
  lifecycle: 'Ciclo de vida',
}

interface OperatorDef {
  value: string
  label: string
  valueless?: boolean
}

const OPERATORS_BY_TYPE: Record<FieldType, OperatorDef[]> = {
  text: [
    { value: 'equals', label: 'é igual a' },
    { value: 'not_equals', label: 'não é igual a' },
    { value: 'contains', label: 'contém' },
    { value: 'is_not_null', label: 'é preenchido', valueless: true },
    { value: 'is_null', label: 'está vazio', valueless: true },
  ],
  number: [
    { value: 'equals', label: 'é igual a' },
    { value: 'greater_than', label: 'é maior que' },
    { value: 'less_than', label: 'é menor que' },
    { value: 'not_equals', label: 'diferente de' },
  ],
  date: [
    { value: 'greater_than', label: 'é depois de' },
    { value: 'less_than', label: 'é antes de' },
    { value: 'is_not_null', label: 'tem valor', valueless: true },
    { value: 'is_null', label: 'sem valor', valueless: true },
  ],
  select: [
    { value: 'equals', label: 'é' },
    { value: 'not_equals', label: 'não é' },
  ],
  boolean: [
    { value: 'equals', label: 'é' },
  ],
}

interface Rule {
  field: string
  operator: string
  value: any
}

interface Segment {
  id: string
  name: string
  description?: string
  segment_type: string
  rules: Rule[]
  rules_logic: 'AND' | 'OR'
  contact_count?: number
}

const formatNumber = (n: number) => isNaN(n) ? '0' : new Intl.NumberFormat('pt-BR').format(n)

// ──────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────
export default function CreateSegmentPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState<Rule[]>([
    { field: 'email_consent', operator: 'equals', value: 'subscribed' },
  ])
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [loadingSegment, setLoadingSegment] = useState(false)

  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [totalContacts, setTotalContacts] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [showFieldPicker, setShowFieldPicker] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const fieldPickerRef = useRef<HTMLDivElement>(null)

  // ────── Load existing segment on edit ──────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('edit')
    if (!id || !user?.organization_id) return

    setEditId(id)
    setLoadingSegment(true)
    fetch(`/api/segments?id=${id}&organization_id=${user.organization_id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.segment) return
        setName(data.segment.name || '')
        setDescription(data.segment.description || '')
        setLogic((data.segment.rules_logic || 'AND') as 'AND' | 'OR')
        if (Array.isArray(data.segment.rules) && data.segment.rules.length > 0) {
          setRules(
            data.segment.rules.map((r: any) => ({
              field: r.field,
              operator: r.operator,
              value: r.value,
            })),
          )
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSegment(false))
  }, [user?.organization_id])

  // ────── Fetch total contacts (denominator) ──────
  useEffect(() => {
    if (!user?.organization_id) return
    const params = new URLSearchParams({
      organization_id: user.organization_id,
      subscribed_only: 'false',
    })
    if (currentStore?.id) params.set('store_id', currentStore.id)
    fetch(`/api/contacts/count?${params}`)
      .then((r) => r.json())
      .then((d) => setTotalContacts(d.count ?? 0))
      .catch(() => setTotalContacts(null))
  }, [user?.organization_id, currentStore?.id])

  // ────── Live preview (debounced) ──────
  const validRules = useMemo(
    () =>
      rules.filter((r) => {
        const def = FIELDS.find((f) => f.name === r.field)
        if (!def) return false
        const op = OPERATORS_BY_TYPE[def.type]?.find((o) => o.value === r.operator)
        if (!op) return false
        if (op.valueless) return true
        return r.value !== '' && r.value !== null && r.value !== undefined
      }),
    [rules],
  )

  const previewKey = useMemo(
    () => JSON.stringify({ rules: validRules, logic }),
    [validRules, logic],
  )

  useEffect(() => {
    if (!user?.organization_id) return
    if (validRules.length === 0) {
      setPreviewCount(null)
      setPreviewError(null)
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/segments/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: user.organization_id,
            store_id: currentStore?.id,
            rules: validRules,
            rules_logic: logic,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Falha ao calcular preview')
        setPreviewCount(data.count ?? 0)
      } catch (err: any) {
        setPreviewError(err?.message || 'Erro ao calcular')
        setPreviewCount(null)
      } finally {
        setPreviewLoading(false)
      }
    }, 500)

    return () => clearTimeout(handle)
  }, [previewKey, user?.organization_id, currentStore?.id])

  // ────── Field picker close on outside ──────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (fieldPickerRef.current && !fieldPickerRef.current.contains(e.target as Node)) {
        setShowFieldPicker(false)
      }
    }
    if (showFieldPicker) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showFieldPicker])

  // ────── Rule mutations ──────
  const addRule = (fieldName: string) => {
    const def = FIELDS.find((f) => f.name === fieldName)
    if (!def) return
    const firstOp = OPERATORS_BY_TYPE[def.type][0]
    setRules((prev) => [
      ...prev,
      {
        field: fieldName,
        operator: firstOp.value,
        value: firstOp.valueless ? '' : def.type === 'select' && def.options ? def.options[0].value : '',
      },
    ])
    setShowFieldPicker(false)
    setFieldSearch('')
  }

  const updateRule = (index: number, patch: Partial<Rule>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  // ────── Save ──────
  const handleSave = async () => {
    if (!name.trim() || !user?.organization_id) return
    setSaving(true)
    try {
      const res = await fetch('/api/segments', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editId ? { id: editId } : {}),
          organization_id: user.organization_id,
          store_id: currentStore?.id,
          name: name.trim(),
          description: description.trim() || null,
          segment_type: 'dynamic',
          rules: validRules,
          rules_logic: logic,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      router.push('/segments')
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar segmento.')
    } finally {
      setSaving(false)
    }
  }

  // ────── Filtered fields for picker ──────
  const pickerFields = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase()
    const groups: Record<string, FieldDef[]> = {}
    for (const f of FIELDS) {
      if (q && !f.label.toLowerCase().includes(q)) continue
      groups[f.group] = groups[f.group] || []
      groups[f.group].push(f)
    }
    return groups
  }, [fieldSearch])

  const canSave = name.trim().length > 0 && validRules.length > 0
  const percentage =
    previewCount !== null && totalContacts && totalContacts > 0
      ? (previewCount / totalContacts) * 100
      : null

  if (loadingSegment) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0">
        <button
          type="button"
          onClick={() => router.push('/segments')}
          className="p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="ml-3 flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-400">
            {editId ? 'Editando segmento' : 'Novo segmento'}
          </p>
          <h1 className="text-sm font-semibold text-gray-900 truncate">
            {name || 'Sem nome'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/segments')}
            className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editId ? 'Salvar alterações' : 'Salvar segmento'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* Left column */}
          <div className="space-y-6 min-w-0">
            {/* Identity */}
            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Detalhes do segmento</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Clientes VIP, Inativos 90d…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Descrição <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva como este segmento será usado…"
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none resize-none"
                  />
                </div>
              </div>
            </section>

            {/* Conditions */}
            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-gray-900">Condições</h2>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-gray-500">Combinar com</span>
                  <div className="flex border border-gray-200 rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setLogic('AND')}
                      className={`px-2.5 py-1 font-medium transition-colors ${
                        logic === 'AND'
                          ? 'bg-brand-500 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      E (todas)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogic('OR')}
                      className={`px-2.5 py-1 font-medium transition-colors ${
                        logic === 'OR'
                          ? 'bg-brand-500 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      OU (qualquer)
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Contatos que satisfazem {logic === 'AND' ? 'todas as' : 'qualquer uma das'} condições
                abaixo farão parte do segmento.
              </p>

              <div className="space-y-2">
                {rules.map((rule, idx) => {
                  const def = FIELDS.find((f) => f.name === rule.field)
                  if (!def) return null
                  const ops = OPERATORS_BY_TYPE[def.type] || []
                  const op = ops.find((o) => o.value === rule.operator)
                  return (
                    <div key={idx}>
                      {idx > 0 && (
                        <div className="flex items-center gap-2 my-2 pl-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                            {logic === 'AND' ? 'E' : 'OU'}
                          </span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                      )}
                      <div className="flex items-stretch gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                        {/* Field */}
                        <select
                          value={rule.field}
                          onChange={(e) => {
                            const newDef = FIELDS.find((f) => f.name === e.target.value)
                            if (!newDef) return
                            const firstOp = OPERATORS_BY_TYPE[newDef.type][0]
                            updateRule(idx, {
                              field: e.target.value,
                              operator: firstOp.value,
                              value: firstOp.valueless
                                ? ''
                                : newDef.type === 'select' && newDef.options
                                ? newDef.options[0].value
                                : '',
                            })
                          }}
                          className="flex-1 min-w-0 bg-white border border-gray-300 rounded-md px-2.5 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                        >
                          {(['identity', 'engagement', 'commerce', 'lifecycle'] as const).map((g) => (
                            <optgroup key={g} label={GROUP_LABELS[g]}>
                              {FIELDS.filter((f) => f.group === g).map((f) => (
                                <option key={f.name} value={f.name}>{f.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {/* Operator */}
                        <select
                          value={rule.operator}
                          onChange={(e) => {
                            const newOp = ops.find((o) => o.value === e.target.value)
                            updateRule(idx, {
                              operator: e.target.value,
                              value: newOp?.valueless ? '' : rule.value,
                            })
                          }}
                          className="bg-white border border-gray-300 rounded-md px-2.5 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                        >
                          {ops.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {/* Value */}
                        {!op?.valueless && (
                          <ValueInput
                            def={def}
                            value={rule.value}
                            onChange={(v) => updateRule(idx, { value: v })}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeRule(idx)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
                          title="Remover condição"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {rules.length === 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Adicione ao menos uma condição para definir o segmento.
                  </div>
                )}

                {/* Add condition */}
                <div className="relative" ref={fieldPickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowFieldPicker((v) => !v)}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar condição
                  </button>
                  {showFieldPicker && (
                    <div className="absolute left-0 top-full mt-1 z-20 w-80 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Buscar campo…"
                          value={fieldSearch}
                          onChange={(e) => setFieldSearch(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm text-gray-900 border border-gray-200 rounded-md placeholder:text-gray-400 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div className="max-h-72 overflow-y-auto py-1">
                        {Object.keys(pickerFields).length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-gray-400">
                            Nenhum campo encontrado
                          </p>
                        ) : (
                          (['identity', 'engagement', 'commerce', 'lifecycle'] as const).map((g) => {
                            const items = pickerFields[g]
                            if (!items?.length) return null
                            return (
                              <div key={g} className="py-1">
                                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                  {GROUP_LABELS[g]}
                                </p>
                                {items.map((f) => (
                                  <button
                                    key={f.name}
                                    type="button"
                                    onClick={() => addRule(f.name)}
                                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    {f.label}
                                  </button>
                                ))}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="flex items-start gap-2 text-xs text-gray-500 px-1">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
              <p>
                Segmentos dinâmicos recalculam a cada envio de campanha. Atualizações em contatos
                (tags, consentimentos, pedidos) refletem automaticamente.
              </p>
            </div>
          </div>

          {/* Right column: live preview */}
          <aside className="lg:sticky lg:top-4 self-start">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-brand-50 to-white">
                <p className="text-xs uppercase tracking-wider font-semibold text-brand-600 mb-1">
                  Pré-visualização ao vivo
                </p>
                <p className="text-xs text-gray-500">
                  Atualiza automaticamente enquanto você edita as condições.
                </p>
              </div>
              <div className="px-5 py-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                    {previewLoading ? (
                      <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
                    ) : (
                      <Users className="w-6 h-6 text-brand-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {previewError ? (
                      <>
                        <p className="text-sm font-semibold text-red-600">Erro</p>
                        <p className="text-xs text-gray-500 truncate">{previewError}</p>
                      </>
                    ) : previewCount === null ? (
                      <>
                        <p className="text-2xl font-bold text-gray-300">—</p>
                        <p className="text-xs text-gray-400">
                          {validRules.length === 0 ? 'Adicione condições' : 'Calculando…'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-bold text-gray-900 leading-none">
                          {formatNumber(previewCount)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          contatos correspondem
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {percentage !== null && previewCount !== null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                      <span>% da base</span>
                      <span className="font-medium text-gray-700">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      de {formatNumber(totalContacts || 0)} contatos totais
                    </p>
                  </div>
                )}

                {previewCount !== null && previewCount > 0 && !previewError && (
                  <div className="mt-5 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>
                      Segmento pronto para uso em campanhas e automações.
                    </p>
                  </div>
                )}

                {previewCount === 0 && validRules.length > 0 && (
                  <div className="mt-5 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>
                      Nenhum contato atende a essas condições. Revise os critérios ou aguarde novos contatos.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Value input (type-aware)
// ──────────────────────────────────────────────────────────
function ValueInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef
  value: any
  onChange: (v: any) => void
}) {
  const baseCls =
    'min-w-[140px] bg-white border border-gray-300 rounded-md px-2.5 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none'

  if (def.type === 'select' && def.options) {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={baseCls}
      >
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  if (def.type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="Valor"
        className={baseCls}
      />
    )
  }

  if (def.type === 'date') {
    return (
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={baseCls}
      />
    )
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Valor"
      className={baseCls}
    />
  )
}

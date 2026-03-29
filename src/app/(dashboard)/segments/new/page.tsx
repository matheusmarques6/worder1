'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase'
import { useAuthStore } from '@/stores'
import { ArrowLeft, Save, Loader2, Users, Eye } from 'lucide-react'
import QueryBuilder, { type RuleGroupType, type Field } from 'react-querybuilder'
import 'react-querybuilder/dist/query-builder.css'

const fields: Field[] = [
  { name: 'email', label: 'Email' },
  { name: 'first_name', label: 'Nome' },
  { name: 'last_name', label: 'Sobrenome' },
  { name: 'phone', label: 'Telefone' },
  { name: 'city', label: 'Cidade' },
  { name: 'state', label: 'Estado' },
  { name: 'country', label: 'País' },
  { name: 'email_consent', label: 'Consentimento Email' },
  { name: 'source', label: 'Origem' },
  { name: 'tags', label: 'Tags' },
  { name: 'created_at', label: 'Data de Criação' },
  { name: 'last_activity_at', label: 'Última Atividade' },
  { name: 'total_orders', label: 'Total de Pedidos' },
  { name: 'total_spent', label: 'Total Gasto' },
]

const defaultQuery: RuleGroupType = {
  combinator: 'and',
  rules: [
    { field: 'email_consent', operator: '=', value: 'subscribed' },
  ],
}

export default function CreateSegmentPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [query, setQuery] = useState<RuleGroupType>(defaultQuery)
  const [saving, setSaving] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const handlePreview = useCallback(async () => {
    if (!user?.organization_id) return
    setPreviewLoading(true)
    try {
      const supabase = createBrowserClient()
      let q = supabase.from('contacts').select('id', { count: 'exact', head: true })
        .eq('organization_id', user.organization_id)

      for (const rule of query.rules) {
        if ('field' in rule && rule.field && rule.value) {
          switch (rule.operator) {
            case '=': q = q.eq(rule.field, rule.value); break
            case '!=': q = q.neq(rule.field, rule.value); break
            case 'contains': q = q.ilike(rule.field, `%${rule.value}%`); break
            case '>': q = q.gt(rule.field, rule.value); break
            case '<': q = q.lt(rule.field, rule.value); break
            case '>=': q = q.gte(rule.field, rule.value); break
            case '<=': q = q.lte(rule.field, rule.value); break
          }
        }
      }

      const { count } = await q
      setPreviewCount(count ?? 0)
    } catch {
      setPreviewCount(0)
    } finally {
      setPreviewLoading(false)
    }
  }, [query, user?.organization_id])

  const handleSave = async () => {
    if (!name.trim() || !user?.organization_id) return
    setSaving(true)
    try {
      const supabase = createBrowserClient()
      const { error } = await supabase.from('segments').insert({
        organization_id: user.organization_id,
        name: name.trim(),
        description: description.trim() || null,
        conditions: query,
        type: 'dynamic',
        contact_count: previewCount ?? 0,
      })
      if (error) throw error
      router.push('/segments')
    } catch (err) {
      console.error('Error saving segment:', err)
      alert('Erro ao salvar segmento. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/segments')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Criar Segmento</h1>
            <p className="text-sm text-gray-500">Defina condições para agrupar seus contatos</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Segmento
        </button>
      </div>

      {/* Name & Description */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Segmento *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Clientes VIP, Inativos 30d..."
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o propósito deste segmento..."
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none resize-none" />
        </div>
      </div>

      {/* Query Builder */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Condições</h2>
        <div className="[&_.ruleGroup]:border [&_.ruleGroup]:border-gray-200 [&_.ruleGroup]:rounded-lg [&_.ruleGroup]:p-4 [&_.ruleGroup]:bg-gray-50 [&_.rule]:flex [&_.rule]:items-center [&_.rule]:gap-2 [&_.rule]:mb-2 [&_select]:border [&_select]:border-gray-300 [&_select]:rounded-md [&_select]:px-3 [&_select]:py-1.5 [&_select]:text-sm [&_select]:text-gray-900 [&_select]:bg-white [&_input]:border [&_input]:border-gray-300 [&_input]:rounded-md [&_input]:px-3 [&_input]:py-1.5 [&_input]:text-sm [&_input]:text-gray-900 [&_input]:bg-white [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-sm [&_button]:rounded-md [&_button]:border [&_button]:border-gray-300 [&_button]:bg-white [&_button]:text-gray-700 [&_button]:hover:bg-gray-50">
          <QueryBuilder
            fields={fields}
            query={query}
            onQueryChange={setQuery}
            controlClassnames={{
              queryBuilder: 'space-y-2',
              ruleGroup: 'space-y-2',
            }}
          />
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Preview do Segmento</h2>
            <p className="text-xs text-gray-500 mt-0.5">Veja quantos contatos correspondem às condições</p>
          </div>
          <button onClick={handlePreview} disabled={previewLoading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Calcular
          </button>
        </div>

        {previewCount !== null && (
          <div className="mt-4 flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{previewCount.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-gray-500">contatos correspondem às condições</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

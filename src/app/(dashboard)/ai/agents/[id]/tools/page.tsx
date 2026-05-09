'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Wrench,
  UserPlus,
  Tag as TagIcon,
  UserCog,
  Package,
  Settings2,
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  Code,
} from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Badge,
  Spinner,
  Toggle,
  Input,
  Textarea,
  Num,
} from '@/components/ai/ui/primitives'

interface ToolRow {
  id: string
  tool_type: string
  name: string
  description: string | null
  enabled: boolean
  config: Record<string, unknown>
  usage_stats: {
    total_calls?: number
    total_failures?: number
    avg_latency_ms?: number
    last_used_at?: string | null
  } | null
  created_at: string
  updated_at: string
}

interface CatalogTool {
  type: string
  name: string
  description: string
  parameters: { properties: Record<string, any>; required?: string[] }
}

const TOOL_META: Record<string, { Icon: typeof Wrench; color: string; label: string }> = {
  transfer_to_human: { Icon: UserPlus, color: '#a855f7', label: 'Transferir p/ humano' },
  send_coupon: { Icon: TagIcon, color: '#f97316', label: 'Enviar cupom' },
  save_lead_field: { Icon: UserCog, color: '#0891b2', label: 'Salvar dado do lead' },
  shopify_get_product: { Icon: Package, color: '#10b981', label: 'Buscar produto Shopify' },
}

export default function AgentToolsPage() {
  const params = useParams<{ id: string }>()
  const agentId = params.id

  const [tools, setTools] = useState<ToolRow[]>([])
  const [catalog, setCatalog] = useState<CatalogTool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingTool, setSavingTool] = useState<string | null>(null)
  const [editing, setEditing] = useState<ToolRow | null>(null)
  const [editingConfig, setEditingConfig] = useState('')
  const [editingError, setEditingError] = useState<string | null>(null)
  const [addingType, setAddingType] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/tools`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao carregar')
      setTools(j.tools ?? [])
      setCatalog(j.catalog ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    load()
  }, [load])

  const enabledTypes = new Set(tools.map((t) => t.tool_type))
  const availableToAdd = catalog.filter((c) => !enabledTypes.has(c.type))

  async function addTool(type: string) {
    setAddingType(type)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_type: type, enabled: true, config: {} }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Falha ao habilitar')
      }
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setAddingType(null)
    }
  }

  async function toggleTool(t: ToolRow) {
    setSavingTool(t.id)
    await fetch(`/api/ai/agents/${agentId}/tools/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !t.enabled }),
    })
    setSavingTool(null)
    await load()
  }

  async function removeTool(t: ToolRow) {
    if (!confirm(`Remover "${t.name}" desse agente?`)) return
    await fetch(`/api/ai/agents/${agentId}/tools/${t.id}`, { method: 'DELETE' })
    await load()
  }

  function openEdit(t: ToolRow) {
    setEditing(t)
    setEditingConfig(JSON.stringify(t.config ?? {}, null, 2))
    setEditingError(null)
  }

  async function saveEdit() {
    if (!editing) return
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(editingConfig || '{}')
    } catch (err) {
      setEditingError('JSON inválido')
      return
    }
    setSavingTool(editing.id)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/tools/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: parsed }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Falha ao salvar')
      }
      setEditing(null)
      await load()
    } catch (err) {
      setEditingError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSavingTool(null)
    }
  }

  return (
    <AgentSubPageShell
      agentId={agentId}
      pageTitle="Ferramentas"
      pageDescription="Funções que o agente pode chamar durante a conversa (function calling)."
    >
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-[13px] text-red-700">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Habilitadas */}
          <section>
            <h2
              className="text-[16px] font-semibold text-[#18181B] mb-3"
              style={{ letterSpacing: '-0.01em' }}
            >
              Habilitadas
            </h2>
            {tools.length === 0 ? (
              <EmptyState
                title="Nenhuma ferramenta habilitada"
                description="Habilite uma das ferramentas disponíveis abaixo para que o agente possa executar ações."
              />
            ) : (
              <div className="space-y-3">
                {tools.map((t) => {
                  const meta = TOOL_META[t.tool_type] ?? {
                    Icon: Wrench,
                    color: '#71717A',
                    label: t.name,
                  }
                  const Icon = meta.Icon
                  const stats = t.usage_stats ?? {}
                  const success =
                    stats.total_calls && stats.total_calls > 0
                      ? Math.round(
                          (((stats.total_calls ?? 0) - (stats.total_failures ?? 0)) /
                            stats.total_calls) *
                            100,
                        )
                      : null
                  return (
                    <Card key={t.id} size="sm">
                      <div className="flex items-start gap-4">
                        <div
                          className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${meta.color}1A` }}
                        >
                          <Icon
                            className="w-4 h-4"
                            style={{ color: meta.color }}
                            strokeWidth={1.75}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-[14px] font-semibold text-[#18181B]">
                              {meta.label}
                            </h4>
                            {!t.enabled && <Badge tone="neutral">Desativada</Badge>}
                            {stats.total_calls && stats.total_calls > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[12px] text-[#71717A]">
                                <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                                <Num>{stats.total_calls}</Num> chamadas · <Num>{success}%</Num>
                                {' '}sucesso
                                {stats.avg_latency_ms ? (
                                  <>
                                    {' '}· <Num>{stats.avg_latency_ms}</Num>ms
                                  </>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-[12px] text-[#A1A1AA]">Sem chamadas ainda</span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-[12px] text-[#71717A] mt-1">{t.description}</p>
                          )}
                          {Object.keys(t.config ?? {}).length > 0 && (
                            <p className="text-[11px] text-[#A1A1AA] mt-2 font-mono">
                              {JSON.stringify(t.config)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(t)}
                            leadingIcon={<Settings2 className="w-3.5 h-3.5" strokeWidth={1.75} />}
                          >
                            Configurar
                          </Button>
                          <Toggle
                            enabled={t.enabled}
                            onClick={() => toggleTool(t)}
                            ariaLabel="Ativar/desativar ferramenta"
                          />
                          <button
                            onClick={() => removeTool(t)}
                            className="p-1.5 text-[#A1A1AA] hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          {/* Disponíveis */}
          {availableToAdd.length > 0 && (
            <section>
              <h2
                className="text-[16px] font-semibold text-[#18181B] mb-3"
                style={{ letterSpacing: '-0.01em' }}
              >
                Disponíveis
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableToAdd.map((c) => {
                  const meta = TOOL_META[c.type] ?? {
                    Icon: Wrench,
                    color: '#71717A',
                    label: c.name,
                  }
                  const Icon = meta.Icon
                  return (
                    <div
                      key={c.type}
                      className="bg-white border border-[#E4E4E7] rounded-[14px] px-5 py-4 flex items-start gap-3"
                    >
                      <div
                        className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${meta.color}1A` }}
                      >
                        <Icon
                          className="w-4 h-4"
                          style={{ color: meta.color }}
                          strokeWidth={1.75}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-semibold text-[#18181B]">
                          {meta.label}
                        </h4>
                        <p className="text-[12px] text-[#71717A] mt-0.5 line-clamp-2">
                          {c.description}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => addTool(c.type)}
                        loading={addingType === c.type}
                        leadingIcon={<Plus className="w-3 h-3" strokeWidth={1.75} />}
                      >
                        Habilitar
                      </Button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {editing && (
        <Modal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={`Configurar — ${TOOL_META[editing.tool_type]?.label ?? editing.name}`}
          description="Edite os parâmetros JSON usados quando a ferramenta é chamada."
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={saveEdit} loading={savingTool === editing.id}>
                Salvar
              </Button>
            </>
          }
        >
          <Field label="Config (JSON)" hint="Ex.: {&quot;prefix&quot;: &quot;FRETE&quot;}">
            <Textarea
              value={editingConfig}
              onChange={(e) => setEditingConfig(e.target.value)}
              rows={10}
              className="font-mono text-[12px]"
            />
          </Field>
          {editingError && (
            <p className="text-[12px] text-red-600">{editingError}</p>
          )}
          <div className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-[10px] p-3 mt-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Code className="w-3.5 h-3.5 text-[#71717A]" strokeWidth={1.75} />
              <span className="text-[11px] font-semibold text-[#52525B] uppercase tracking-wide">
                Schema
              </span>
            </div>
            <pre className="text-[11px] text-[#52525B] font-mono whitespace-pre-wrap">
              {JSON.stringify(
                catalog.find((c) => c.type === editing.tool_type)?.parameters,
                null,
                2,
              )}
            </pre>
          </div>
        </Modal>
      )}
    </AgentSubPageShell>
  )
}

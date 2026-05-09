'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  BookOpen,
  Link as LinkIcon,
  FileText,
  File as FileIcon,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  Upload,
  Database,
  HelpCircle,
  Building2,
  Truck,
  Package,
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
  Input,
  Textarea,
  Select,
  Num,
  SectionHeader,
} from '@/components/ai/ui/primitives'
import { useAuthStore } from '@/stores'

type Layer = 'institutional' | 'operational' | 'catalog' | 'faq' | 'execution'
type SourceType = 'url' | 'text' | 'file' | 'faq' | 'integration' | 'products'
type Status = 'pending' | 'processing' | 'ready' | 'error'

interface Source {
  id: string
  agent_id: string
  layer: Layer
  source_type: SourceType
  name: string
  url?: string | null
  text_content?: string | null
  file_url?: string | null
  file_size_bytes?: number | null
  original_filename?: string | null
  mime_type?: string | null
  pages_crawled?: number | null
  products_count?: number | null
  status: Status
  error_message?: string | null
  chunks_count: number
  created_at: string
  last_indexed_at?: string | null
}

const LAYER_META: Record<
  Layer,
  { label: string; description: string; Icon: typeof Building2; color: string }
> = {
  institutional: {
    label: 'Institucional',
    description: 'Quem é a marca: missão, voz, sobre, manuais.',
    Icon: Building2,
    color: '#a855f7',
  },
  operational: {
    label: 'Operacional',
    description: 'Como a loja opera: políticas, prazos, pagamento, frete.',
    Icon: Truck,
    color: '#0891b2',
  },
  catalog: {
    label: 'Catálogo',
    description: 'Produtos, variações, preços, estoque.',
    Icon: Package,
    color: '#f59e0b',
  },
  faq: {
    label: 'FAQ',
    description: 'Perguntas frequentes em pares pergunta/resposta.',
    Icon: HelpCircle,
    color: '#16a34a',
  },
  execution: {
    label: 'Execução',
    description: 'Roteiros e scripts pra cenários específicos.',
    Icon: Database,
    color: '#0ea5e9',
  },
}

const SOURCE_TYPE_META: Record<SourceType, { label: string; Icon: typeof LinkIcon }> = {
  url: { label: 'URL', Icon: LinkIcon },
  text: { label: 'Texto', Icon: FileText },
  file: { label: 'Arquivo', Icon: FileIcon },
  faq: { label: 'FAQ', Icon: HelpCircle },
  integration: { label: 'Integração', Icon: Database },
  products: { label: 'Produtos', Icon: Package },
}

const STATUS_TONE: Record<
  Status,
  'success' | 'warning' | 'neutral' | 'danger'
> = {
  ready: 'success',
  pending: 'neutral',
  processing: 'warning',
  error: 'danger',
}

const STATUS_LABEL: Record<Status, string> = {
  ready: 'Pronto',
  pending: 'Aguardando',
  processing: 'Processando',
  error: 'Erro',
}

interface AddForm {
  type: 'url' | 'text' | 'file'
  layer: Layer
  name: string
  url: string
  textContent: string
  file: File | null
}

const EMPTY_FORM: AddForm = {
  type: 'url',
  layer: 'operational',
  name: '',
  url: '',
  textContent: '',
  file: null,
}

export default function AgentSourcesPage() {
  const params = useParams<{ id: string }>()
  const agentId = params.id
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id

  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [layerFilter, setLayerFilter] = useState<Layer | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [reprocessing, setReprocessing] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/ai/agents/${agentId}/sources?organization_id=${organizationId}`,
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao carregar')
      setSources(j.sources ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [agentId, organizationId])

  useEffect(() => {
    load()
  }, [load])

  // Polling leve quando há fontes processando
  useEffect(() => {
    const hasInFlight = sources.some(
      (s) => s.status === 'pending' || s.status === 'processing',
    )
    if (!hasInFlight) return
    const t = setTimeout(load, 4000)
    return () => clearTimeout(t)
  }, [sources, load])

  async function createSource() {
    if (!form.name.trim()) {
      alert('Dê um nome à fonte')
      return
    }
    if (!organizationId) return
    setSaving(true)
    try {
      if (form.type === 'file') {
        if (!form.file) {
          alert('Selecione um arquivo')
          setSaving(false)
          return
        }
        const fd = new FormData()
        fd.append('file', form.file)
        fd.append('organization_id', organizationId)
        fd.append('layer', form.layer)
        fd.append('name', form.name.trim())
        const res = await fetch(`/api/ai/agents/${agentId}/sources/upload`, {
          method: 'POST',
          body: fd,
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Falha no upload')
      } else {
        const body: Record<string, unknown> = {
          organization_id: organizationId,
          layer: form.layer,
          source_type: form.type,
          name: form.name.trim(),
        }
        if (form.type === 'url') body.url = form.url.trim()
        if (form.type === 'text') body.text_content = form.textContent.trim()
        const res = await fetch(`/api/ai/agents/${agentId}/sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Falha ao criar')
      }
      setModalOpen(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  async function reprocess(s: Source) {
    setReprocessing(s.id)
    try {
      const res = await fetch(
        `/api/ai/agents/${agentId}/sources/${s.id}/reprocess`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Falha ao reprocessar')
      }
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setReprocessing(null)
    }
  }

  async function removeSource(s: Source) {
    if (!confirm(`Remover "${s.name}"?`)) return
    if (!organizationId) return
    const res = await fetch(
      `/api/ai/agents/${agentId}/sources/${s.id}?organization_id=${organizationId}`,
      { method: 'DELETE' },
    )
    if (res.ok) await load()
  }

  const filtered =
    layerFilter === 'all' ? sources : sources.filter((s) => s.layer === layerFilter)

  const counts = (Object.keys(LAYER_META) as Layer[]).map((l) => ({
    layer: l,
    count: sources.filter((s) => s.layer === l).length,
  }))

  const totalChunks = sources.reduce((acc, s) => acc + (s.chunks_count ?? 0), 0)

  return (
    <AgentSubPageShell
      agentId={agentId}
      pageTitle="Conhecimento"
      pageDescription="Tudo que o agente sabe sobre a sua loja, organizado por camada."
      actions={
        <Button
          variant="cta"
          onClick={() => setModalOpen(true)}
          leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Nova fonte
        </Button>
      }
    >
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-[13px] text-red-700">{error}</p>
        </Card>
      )}

      {/* Resumo por camada */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {counts.map(({ layer, count }) => {
          const meta = LAYER_META[layer]
          const Icon = meta.Icon
          const active = layerFilter === layer
          return (
            <button
              key={layer}
              onClick={() => setLayerFilter(active ? 'all' : layer)}
              className={`text-left rounded-[14px] border px-5 py-[18px] transition-colors ${
                active
                  ? 'bg-white border-[#18181B] ring-2 ring-[#18181B]/10'
                  : 'bg-white border-[#E4E4E7] hover:bg-[#FAFAFA]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-7 h-7 rounded-[8px] flex items-center justify-center"
                  style={{ backgroundColor: `${meta.color}1A` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} strokeWidth={1.75} />
                </div>
                <span className="text-[12px] font-semibold text-[#18181B]">
                  {meta.label}
                </span>
              </div>
              <p
                className="text-[20px] font-bold text-[#18181B]"
                style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
              >
                <Num>{count}</Num>
              </p>
              <p className="text-[11px] text-[#A1A1AA] mt-0.5 line-clamp-1">
                {meta.description}
              </p>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionHeader
          title={
            layerFilter === 'all'
              ? 'Todas as fontes'
              : `Camada · ${LAYER_META[layerFilter as Layer].label}`
          }
          description={`${sources.length} fonte${sources.length === 1 ? '' : 's'} · ${totalChunks} chunks indexados`}
        />
        {layerFilter !== 'all' && (
          <Button variant="ghost" size="sm" onClick={() => setLayerFilter('all')}>
            Limpar filtro
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={layerFilter === 'all' ? 'Sem fontes ainda' : 'Camada vazia'}
          description={
            layerFilter === 'all'
              ? 'Adicione URLs do seu site, textos institucionais ou um PDF de FAQ. O agente vai usar isso como contexto.'
              : 'Adicione uma fonte nessa camada ou troque o filtro.'
          }
          action={
            <Button
              variant="cta"
              onClick={() => setModalOpen(true)}
              leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
            >
              Nova fonte
            </Button>
          }
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-[#F4F4F5]">
            {filtered.map((s) => {
              const layerMeta = LAYER_META[s.layer]
              const typeMeta = SOURCE_TYPE_META[s.source_type] ?? SOURCE_TYPE_META.text
              const TypeIcon = typeMeta.Icon
              return (
                <li key={s.id} className="flex items-start gap-4 px-7 py-4">
                  <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${layerMeta.color}1A` }}
                  >
                    <TypeIcon
                      className="w-4 h-4"
                      style={{ color: layerMeta.color }}
                      strokeWidth={1.75}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-[14px] font-semibold text-[#18181B] truncate">
                        {s.name}
                      </h4>
                      <Badge tone={STATUS_TONE[s.status]}>
                        {(s.status === 'processing' || s.status === 'pending') && (
                          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.75} />
                        )}
                        {STATUS_LABEL[s.status]}
                      </Badge>
                      <Badge tone="subtle">{layerMeta.label}</Badge>
                      <Badge tone="subtle">{typeMeta.label}</Badge>
                    </div>
                    {s.url && (
                      <p className="text-[12px] text-[#71717A] mt-1 truncate">{s.url}</p>
                    )}
                    {s.original_filename && (
                      <p className="text-[12px] text-[#71717A] mt-1 truncate">
                        {s.original_filename}
                      </p>
                    )}
                    {s.error_message && (
                      <p className="text-[12px] text-red-600 mt-1 truncate">
                        {s.error_message}
                      </p>
                    )}
                    <p className="text-[11px] text-[#A1A1AA] mt-1.5">
                      <Num>{s.chunks_count ?? 0}</Num> chunks
                      {s.last_indexed_at
                        ? ` · indexado ${new Date(s.last_indexed_at).toLocaleString('pt-BR')}`
                        : ` · criado ${new Date(s.created_at).toLocaleString('pt-BR')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(s.status === 'ready' || s.status === 'error') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => reprocess(s)}
                        loading={reprocessing === s.id}
                        leadingIcon={<RefreshCw className="w-3 h-3" strokeWidth={1.75} />}
                      >
                        Reprocessar
                      </Button>
                    )}
                    <button
                      onClick={() => removeSource(s)}
                      className="p-1.5 text-[#A1A1AA] hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* Modal nova fonte */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova fonte"
        description="Adicione conteúdo à base de conhecimento do agente."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={createSource} loading={saving}>
              Adicionar
            </Button>
          </>
        }
      >
        <Field label="Tipo" required>
          <div className="grid grid-cols-3 gap-2">
            {(['url', 'text', 'file'] as const).map((t) => {
              const meta = SOURCE_TYPE_META[t]
              const Icon = meta.Icon
              const active = form.type === t
              return (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={`flex flex-col items-center justify-center gap-2 py-3 rounded-[10px] border transition-colors ${
                    active
                      ? 'bg-white border-[#18181B] ring-2 ring-[#18181B]/10'
                      : 'bg-white border-[#E4E4E7] hover:bg-[#FAFAFA]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${active ? 'text-[#18181B]' : 'text-[#71717A]'}`}
                    strokeWidth={1.75}
                  />
                  <span
                    className={`text-[12px] font-semibold ${
                      active ? 'text-[#18181B]' : 'text-[#52525B]'
                    }`}
                  >
                    {meta.label}
                  </span>
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Camada" required>
          <Select
            value={form.layer}
            onChange={(e) => setForm({ ...form, layer: e.target.value as Layer })}
          >
            {(Object.keys(LAYER_META) as Layer[]).map((l) => (
              <option key={l} value={l}>
                {LAYER_META[l].label} — {LAYER_META[l].description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder='Ex.: "Política de troca"'
          />
        </Field>
        {form.type === 'url' && (
          <Field label="URL" required hint="O agente vai fazer crawl da página.">
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://..."
            />
          </Field>
        )}
        {form.type === 'text' && (
          <Field label="Conteúdo" required hint="Cole até 10.000 caracteres.">
            <Textarea
              value={form.textContent}
              onChange={(e) => setForm({ ...form, textContent: e.target.value })}
              rows={8}
              placeholder="Cole o texto..."
            />
          </Field>
        )}
        {form.type === 'file' && (
          <Field
            label="Arquivo"
            required
            hint="PDF, DOCX, TXT ou CSV. Até 25MB."
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.csv"
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-[#FAFAFA] border-2
                         border-dashed border-[#E4E4E7] rounded-[10px] hover:bg-white hover:border-[#D4D4D8]
                         transition-colors"
            >
              <Upload className="w-4 h-4 text-[#71717A]" strokeWidth={1.75} />
              <span className="text-[13px] text-[#52525B]">
                {form.file ? form.file.name : 'Clique para selecionar'}
              </span>
            </button>
          </Field>
        )}
      </Modal>
    </AgentSubPageShell>
  )
}

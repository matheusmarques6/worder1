'use client'

// =============================================================
// Integrações → Mapeamento de variáveis
//
// O nome da variável é estável ({{ CheckoutURL }}); o campo de onde o
// valor sai depende de quem produziu o evento. Aqui o lojista vê a
// cascata padrão, o valor que ela dá num evento REAL, e reaponta a
// variável para outro campo quando a integração dele é diferente.
//
// É o lugar certo para os caminhos crus do payload — que antes
// poluíam o editor de e-mail com 281 linhas. Lá se escolhe a
// variável; aqui ela é apontada.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Variable, RotateCcw, Check, ChevronDown, Loader2, Search,
  CheckCircle2, AlertCircle, Plus, X, Info,
} from 'lucide-react'

interface EventTag {
  tag: string
  label: string
  group: string
  groupLabel: string
  description: string | null
  sample: string
  isUrl: boolean
  defaultPaths: string[]
  mappedPaths: string[] | null
  defaultValue: string | null
  resolved: { value: string | null; matchedPath: string | null; source: string } | null
}

interface DiscoveredPath {
  path: string
  sample: any
  type: string
}

const TRIGGERS = [
  { id: 'trigger_checkout_abandoned', label: 'Checkout abandonado' },
  { id: 'trigger_abandon', label: 'Carrinho abandonado' },
  { id: 'trigger_order', label: 'Pedido realizado' },
  { id: 'trigger_fulfilled_order', label: 'Pedido enviado' },
  { id: 'trigger_cancelled_order', label: 'Pedido cancelado' },
  { id: 'trigger_viewed_product', label: 'Produto visualizado' },
  { id: 'trigger_added_to_cart', label: 'Adicionado ao carrinho' },
  { id: 'trigger_back_in_stock', label: 'Voltou ao estoque' },
]

export default function VariableMappingPage() {
  const [triggerType, setTriggerType] = useState(TRIGGERS[0].id)
  const [tags, setTags] = useState<EventTag[]>([])
  const [discovered, setDiscovered] = useState<DiscoveredPath[]>([])
  const [sampleAt, setSampleAt] = useState<string | null>(null)
  const [hasSample, setHasSample] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const [mapa, disc] = await Promise.all([
        fetch(`/api/merge-tags/mapping?triggerType=${encodeURIComponent(triggerType)}`)
          .then(r => (r.ok ? r.json() : null)),
        fetch(`/api/automations/variables/discover?triggerType=${encodeURIComponent(triggerType)}`)
          .then(r => (r.ok ? r.json() : { paths: [] }))
          .catch(() => ({ paths: [] })),
      ])
      if (mapa) {
        setTags(mapa.eventTags || [])
        setSampleAt(mapa.sampleEventAt || null)
        setHasSample(Boolean(mapa.hasSample))
      } else {
        setErro('Não foi possível carregar as variáveis.')
      }
      // Os caminhos vêm com o prefixo trigger.; aqui só interessa o
      // caminho dentro do payload.
      setDiscovered(
        (disc.paths || []).map((p: DiscoveredPath) => ({ ...p, path: p.path.replace(/^trigger\./, '') }))
      )
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }, [triggerType])

  useEffect(() => { carregar() }, [carregar])

  const salvar = async (tag: string, paths: string[], defaultValue: string | null) => {
    setSaving(tag)
    setErro(null)
    try {
      const res = await fetch('/api/merge-tags/mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, paths, defaultValue }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErro(json.error || 'Não foi possível salvar.')
        return
      }
      await carregar()
      setExpanded(null)
    } catch {
      setErro('Erro de conexão ao salvar.')
    } finally {
      setSaving(null)
    }
  }

  const restaurar = async (tag: string) => {
    setSaving(tag)
    try {
      await fetch(`/api/merge-tags/mapping?tag=${encodeURIComponent(tag)}`, { method: 'DELETE' })
      await carregar()
    } finally {
      setSaving(null)
    }
  }

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tags
    return tags.filter(t =>
      t.tag.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)
    )
  }, [tags, search])

  const porGrupo = useMemo(() => {
    const m = new Map<string, EventTag[]>()
    for (const t of filtradas) {
      const l = m.get(t.groupLabel)
      if (l) l.push(t)
      else m.set(t.groupLabel, [t])
    }
    return [...m.entries()]
  }, [filtradas])

  const resolvidas = tags.filter(t => t.resolved?.value).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
          <Variable className="w-4.5 h-4.5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Mapeamento de variáveis</h1>
          <p className="text-sm text-gray-500">
            O nome da variável nunca muda. O campo de onde o valor sai, sim — e é aqui que você aponta.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select
          value={triggerType}
          onChange={e => setTriggerType(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-brand-500"
        >
          {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar variável…"
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Estado da amostra: sem evento real, o mapeamento é às cegas. */}
      <div className="mt-3">
        {loading ? (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Carregando…
          </p>
        ) : hasSample ? (
          <p className="text-xs text-gray-500">
            <strong className="text-emerald-600">{resolvidas}</strong> de {tags.length} variáveis
            resolvem no último evento recebido
            {sampleAt && <> ({new Date(sampleAt).toLocaleString('pt-BR')})</>}.
          </p>
        ) : (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-amber-800">
              Nenhum evento deste gatilho chegou ainda. Você pode mapear mesmo assim,
              mas não dá para conferir o valor até o primeiro evento.
            </p>
          </div>
        )}
      </div>

      {erro && (
        <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="mt-5 space-y-5">
        {porGrupo.map(([grupo, lista]) => (
          <div key={grupo}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-2">{grupo}</p>
            <div className="space-y-2">
              {lista.map(t => (
                <TagMappingRow
                  key={t.tag}
                  tag={t}
                  discovered={discovered}
                  expanded={expanded === t.tag}
                  saving={saving === t.tag}
                  onToggle={() => setExpanded(expanded === t.tag ? null : t.tag)}
                  onSave={(paths, def) => salvar(t.tag, paths, def)}
                  onReset={() => restaurar(t.tag)}
                />
              ))}
            </div>
          </div>
        ))}
        {!loading && porGrupo.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">Nenhuma variável encontrada.</p>
        )}
      </div>
    </div>
  )
}

function TagMappingRow({
  tag, discovered, expanded, saving, onToggle, onSave, onReset,
}: {
  tag: EventTag
  discovered: DiscoveredPath[]
  expanded: boolean
  saving: boolean
  onToggle: () => void
  onSave: (paths: string[], defaultValue: string | null) => void
  onReset: () => void
}) {
  const [paths, setPaths] = useState<string[]>(tag.mappedPaths || [])
  const [def, setDef] = useState(tag.defaultValue || '')
  const [novoPath, setNovoPath] = useState('')

  // Reabrir a linha depois de salvar tem de mostrar o que está salvo,
  // não o rascunho anterior.
  useEffect(() => {
    setPaths(tag.mappedPaths || [])
    setDef(tag.defaultValue || '')
  }, [tag.mappedPaths, tag.defaultValue, expanded])

  const remapeada = Boolean(tag.mappedPaths?.length || tag.defaultValue)
  const valor = tag.resolved?.value
  const sugestoes = useMemo(() => {
    const q = novoPath.trim().toLowerCase()
    const base = discovered.filter(d => !paths.includes(d.path))
    if (!q) return base.slice(0, 8)
    return base.filter(d => d.path.toLowerCase().includes(q)).slice(0, 8)
  }, [discovered, novoPath, paths])

  const adicionar = (p: string) => {
    const limpo = p.trim()
    if (!limpo || paths.includes(limpo)) return
    setPaths([...paths, limpo])
    setNovoPath('')
  }

  return (
    <div className={`border rounded-lg bg-white transition-colors ${expanded ? 'border-brand-300' : 'border-gray-200'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{tag.label}</span>
            <code className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {`{{ ${tag.tag} }}`}
            </code>
            {remapeada && (
              <span className="text-[9px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-px rounded">
                mapeada
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {valor ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="text-[11px] text-gray-600 truncate">{valor}</span>
                {tag.resolved?.matchedPath && (
                  <code className="text-[10px] text-gray-400 font-mono shrink-0">
                    ← {tag.resolved.matchedPath}
                  </code>
                )}
              </>
            ) : (
              <span className="text-[11px] text-amber-600">
                Sem valor no último evento
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
          <div className="flex items-start gap-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-blue-800 leading-snug">
              Procuramos nos campos abaixo, na ordem. O primeiro que existir no evento vence.
              Deixe vazio para usar a busca padrão da Worder.
            </p>
          </div>

          {/* Cascata padrão — sempre visível, para o lojista saber o que
              já é tentado antes de inventar um caminho. */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Busca padrão da Worder
            </p>
            <div className="flex flex-wrap gap-1">
              {tag.defaultPaths.map(p => (
                <code key={p} className="text-[10px] font-mono text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                  {p}
                </code>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Seus campos {paths.length > 0 && <span className="text-violet-600">(têm prioridade)</span>}
            </p>
            {paths.length === 0 ? (
              <p className="text-[11px] text-gray-400 mb-1.5">Nenhum — usando a busca padrão.</p>
            ) : (
              <div className="space-y-1 mb-1.5">
                {paths.map((p, i) => (
                  <div key={p} className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded px-2 py-1">
                    <span className="text-[10px] text-violet-400 font-mono w-4">{i + 1}º</span>
                    <code className="text-[11px] font-mono text-violet-900 flex-1 truncate">{p}</code>
                    <button
                      onClick={() => setPaths(paths.filter(x => x !== p))}
                      className="p-0.5 text-violet-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                value={novoPath}
                onChange={e => setNovoPath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(novoPath) } }}
                placeholder="Ex.: raw.abandoned_checkout_url"
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-[12px] font-mono focus:outline-none focus:border-brand-500"
              />
              {sugestoes.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {sugestoes.map(d => (
                    <button
                      key={d.path}
                      onClick={() => adicionar(d.path)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 hover:bg-gray-50 text-left"
                    >
                      <code className="text-[11px] font-mono text-gray-700 truncate">{d.path}</code>
                      <span className="text-[10px] text-gray-400 truncate max-w-[45%]">
                        {d.sample === null ? 'null' : String(d.sample).slice(0, 40)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {discovered.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Os campos disponíveis aparecem aqui quando um evento deste gatilho chegar.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Valor quando nada for encontrado
            </p>
            <input
              value={def}
              onChange={e => setDef(e.target.value)}
              placeholder={tag.isUrl ? 'Ex.: https://minhaloja.com' : 'Deixe vazio para não preencher'}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-[12px] focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {remapeada ? (
              <button
                onClick={onReset}
                disabled={saving}
                className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" /> Voltar ao padrão
              </button>
            ) : <span />}
            <button
              onClick={() => onSave(paths, def.trim() || null)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-[12px] font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

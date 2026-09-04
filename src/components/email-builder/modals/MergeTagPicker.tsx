'use client'

// =============================================================
// Seletor de variáveis do e-mail
//
// A tela antiga misturava CINCO fontes: catálogo estático, lista
// canônica, 281 caminhos crus auto-descobertos do payload, variáveis
// personalizadas e apelidos pontilhados. O mesmo conceito aparecia
// três vezes com nomes diferentes ({{store_url}}, {{ StoreURL }},
// {{ event.extra.referring_site }}) e nada dizia qual delas de fato
// preenchia alguma coisa.
//
// Agora são duas famílias, que é a distinção que importa na hora de
// escrever um e-mail:
//
//   Plataforma — sai do contato, da loja ou do sistema. Funciona em
//     qualquer e-mail, sempre, sem depender de evento.
//   Do evento  — sai do que chegou no gatilho. O nome é estável; o
//     caminho até o valor é configurável em Integrações.
//
// Os caminhos crus do payload saíram daqui de propósito: escolher
// caminho é trabalho da tela de mapeamento, não de quem escreve o
// e-mail. Aqui você escolhe a variável; lá ela é apontada.
// =============================================================

import { useState, useMemo, useEffect } from 'react'
import {
  X, Search, User, Store, ShoppingCart, Package, Truck, Settings2,
  Zap, Sparkles, CheckCircle2, AlertCircle, Loader2, ExternalLink, Braces, type LucideIcon,
} from 'lucide-react'
import {
  PLATFORM_TAGS, eventTagsForTrigger, TAG_GROUP_LABELS,
  type CatalogTag, type TagGroup,
} from '@/lib/merge-tags/catalog'

const GROUP_ICON: Record<TagGroup, LucideIcon> = {
  contact: User,
  purchases: ShoppingCart,
  store: Store,
  system: Settings2,
  order: Package,
  cart: ShoppingCart,
  product: Package,
  customer: User,
  shipping: Truck,
}

const TRIGGER_LABELS: Record<string, string> = {
  trigger_abandon: 'Carrinho abandonado',
  trigger_checkout_abandoned: 'Checkout abandonado',
  trigger_order: 'Pedido realizado',
  trigger_order_paid: 'Pedido pago',
  trigger_fulfilled_order: 'Pedido enviado',
  trigger_cancelled_order: 'Pedido cancelado',
  trigger_browse_abandoned: 'Navegação abandonada',
  trigger_back_in_stock: 'Produto voltou ao estoque',
  trigger_price_drop: 'Queda de preço',
  trigger_viewed_product: 'Produto visualizado',
  trigger_added_to_cart: 'Adicionado ao carrinho',
  trigger_first_purchase: 'Primeira compra',
  trigger_repeat_purchase: 'Compra recorrente',
  trigger_signup: 'Contato criado',
  trigger_form_submitted: 'Formulário enviado',
  trigger_popup_subscribed: 'Inscrito via popup',
}

function triggerLabel(t?: string): string {
  if (!t) return ''
  return TRIGGER_LABELS[t] || t.replace(/^trigger_/, '').replace(/_/g, ' ')
}

/** O que a API de mapeamento devolve por variável de evento. */
interface EventTagStatus {
  tag: string
  mappedPaths: string[] | null
  resolved: { value: string | null; matchedPath: string | null; source: string } | null
}

interface DiscoveredPath {
  path: string
  sample: any
  type: string
}

interface CustomVariable {
  variable_key: string
  label: string
  description: string | null
  enabled: boolean
  applicable_triggers: string[] | null
}

interface MergeTagPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (tagValue: string, label?: string) => void
  context?: 'campaign' | 'automation'
  triggerType?: string
}

type Family = 'platform' | 'event'

export function MergeTagPicker({ isOpen, onClose, onSelect, context, triggerType }: MergeTagPickerProps) {
  const isAutomation = context === 'automation'
  const [search, setSearch] = useState('')
  const [family, setFamily] = useState<Family>(isAutomation ? 'event' : 'platform')
  const [inserted, setInserted] = useState('')
  const [status, setStatus] = useState<Record<string, EventTagStatus>>({})
  const [hasSample, setHasSample] = useState<boolean | null>(null)
  const [customVars, setCustomVars] = useState<CustomVariable[]>([])
  const [loading, setLoading] = useState(false)
  // Campos crus do payload. Ficam RECOLHIDOS: eram os 281 itens que
  // afogavam a tela. Some-los de vez tiraria capacidade de quem precisa
  // de um campo que ainda não virou variável do catálogo, então eles
  // continuam aqui — só que atrás de um clique, onde não atrapalham.
  const [rawPaths, setRawPaths] = useState<DiscoveredPath[]>([])
  const [showRaw, setShowRaw] = useState(false)

  // Campanha não tem gatilho, então a família de evento não se aplica.
  useEffect(() => {
    if (!isAutomation) setFamily('platform')
  }, [isAutomation])

  // Uma chamada só traz o catálogo de evento com mapeamento E o valor
  // que cada variável daria no último evento real. É o que permite
  // marcar "resolve" ou "sem dado" antes de a pessoa inserir a tag.
  useEffect(() => {
    if (!isOpen || !isAutomation) return
    let cancelado = false
    setLoading(true)
    const qs = triggerType ? `?triggerType=${encodeURIComponent(triggerType)}` : ''
    Promise.all([
      fetch(`/api/merge-tags/mapping${qs}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/automations/variables/custom').then(r => (r.ok ? r.json() : null)).catch(() => null),
      triggerType
        ? fetch(`/api/automations/variables/discover?triggerType=${encodeURIComponent(triggerType)}`)
            .then(r => (r.ok ? r.json() : { paths: [] })).catch(() => ({ paths: [] }))
        : Promise.resolve({ paths: [] }),
    ]).then(([mapa, cust, disc]) => {
      if (cancelado) return
      if (mapa) {
        const idx: Record<string, EventTagStatus> = {}
        for (const t of mapa.eventTags || []) idx[t.tag] = t
        setStatus(idx)
        setHasSample(Boolean(mapa.hasSample))
      }
      setRawPaths(
        ((disc as any).paths || []).map((p: DiscoveredPath) => ({
          ...p, path: p.path.replace(/^trigger\./, ''),
        }))
      )
      const todas: CustomVariable[] = cust?.variables || []
      setCustomVars(
        todas.filter(v =>
          v.enabled &&
          (!v.applicable_triggers || v.applicable_triggers.length === 0 ||
            (triggerType ? v.applicable_triggers.includes(triggerType) : true))
        )
      )
    }).finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [isOpen, isAutomation, triggerType])

  const eventTags = useMemo(() => eventTagsForTrigger(triggerType), [triggerType])

  const visible = useMemo(() => {
    const base = family === 'platform' ? PLATFORM_TAGS : eventTags
    const q = search.trim().toLowerCase()
    const filtradas = !q
      ? base
      : base.filter(t =>
          t.tag.toLowerCase().includes(q) ||
          t.label.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q)
        )
    // Agrupa preservando a ordem do catálogo — a ordem foi escolhida
    // por relevância, não por alfabeto.
    const porGrupo = new Map<TagGroup, CatalogTag[]>()
    for (const t of filtradas) {
      const lista = porGrupo.get(t.group)
      if (lista) lista.push(t)
      else porGrupo.set(t.group, [t])
    }
    return [...porGrupo.entries()]
  }, [family, eventTags, search])

  const customFiltradas = useMemo(() => {
    if (family !== 'event' || customVars.length === 0) return []
    const q = search.trim().toLowerCase()
    if (!q) return customVars
    return customVars.filter(v =>
      v.variable_key.toLowerCase().includes(q) || (v.label || '').toLowerCase().includes(q)
    )
  }, [family, customVars, search])

  const escolher = (tag: string, label: string) => {
    const valor = `{{ ${tag} }}`
    onSelect(valor, label)
    navigator.clipboard.writeText(valor).catch(() => {})
    setInserted(tag)
    setTimeout(() => setInserted(''), 1500)
  }

  if (!isOpen) return null

  const totalVisivel = visible.reduce((n, [, tags]) => n + tags.length, 0) + customFiltradas.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Variáveis</h3>
            {isAutomation && triggerType && (
              <p className="text-[11px] text-gray-500">{triggerLabel(triggerType)}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={18} />
          </button>
        </div>

        {/* Famílias */}
        {isAutomation && (
          <div className="flex gap-1 px-4 pt-3">
            {([
              { id: 'event' as const, label: 'Do evento', icon: Zap, count: eventTags.length },
              { id: 'platform' as const, label: 'Da plataforma', icon: Store, count: PLATFORM_TAGS.length },
            ]).map(f => (
              <button
                key={f.id}
                onClick={() => setFamily(f.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  family === f.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
                <span className={family === f.id ? 'text-white/60' : 'text-gray-400'}>{f.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Busca */}
        <div className="px-4 py-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar variável…"
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
              autoFocus
            />
          </div>
        </div>

        {/* Explicação da família ativa — curta, sem parecer aviso de erro */}
        <div className="px-4 pb-2">
          {family === 'platform' ? (
            <p className="text-[11px] text-gray-500 leading-snug">
              Saem do cadastro do contato, das configurações da loja ou do sistema.
              Funcionam em qualquer e-mail, sempre.
            </p>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] text-gray-500 leading-snug flex-1">
                Saem do evento que dispara a automação. O nome é fixo; o campo de onde
                o valor sai é configurável.
                {loading && <Loader2 className="w-3 h-3 inline-block ml-1 animate-spin" />}
              </p>
              <a
                href="/integrations/variaveis"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-brand-600 hover:underline flex items-center gap-0.5 shrink-0"
              >
                Mapear <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          )}
        </div>

        {family === 'event' && hasSample === false && !loading && (
          <div className="mx-4 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-800">
              Ainda não recebemos um evento deste gatilho, então não dá para conferir
              os valores agora. As variáveis abaixo continuam válidas.
            </p>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {totalVisivel === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Nenhuma variável encontrada</p>
          ) : (
            <div className="space-y-4">
              {visible.map(([grupo, tags]) => {
                const Icon = GROUP_ICON[grupo]
                return (
                  <div key={grupo}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-1.5 flex items-center gap-1.5">
                      <Icon className="w-3 h-3" />
                      {TAG_GROUP_LABELS[grupo]}
                    </p>
                    <div className="space-y-1">
                      {tags.map(t => (
                        <TagRow
                          key={t.tag}
                          spec={t}
                          status={family === 'event' ? status[t.tag] : undefined}
                          inserted={inserted === t.tag}
                          onClick={() => escolher(t.tag, t.label)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Campos crus do evento — recolhidos. Só aparecem para
                  quem procurar, e são a saída para um campo que ainda
                  não virou variável do catálogo. */}
              {family === 'event' && rawPaths.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="w-full flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-1.5 hover:text-gray-600"
                  >
                    <span className="flex items-center gap-1.5">
                      <Braces className="w-3 h-3" />
                      Campos brutos do evento ({rawPaths.length})
                    </span>
                    <span className="text-[9px] normal-case font-medium tracking-normal">
                      {showRaw ? 'ocultar' : 'mostrar'}
                    </span>
                  </button>
                  {showRaw && (
                    <>
                      <p className="text-[10px] text-gray-400 mb-1.5 leading-snug">
                        Use só quando o campo não tiver variável própria. Ele pode mudar de nome
                        se a integração mudar — a variável do catálogo, não.
                      </p>
                      <div className="space-y-1">
                        {rawPaths
                          .filter(p => !search.trim() || p.path.toLowerCase().includes(search.trim().toLowerCase()))
                          .slice(0, 40)
                          .map(p => (
                            <button
                              key={p.path}
                              onClick={() => escolher(`event.${p.path}`, p.path)}
                              className="w-full flex items-center justify-between gap-2 p-2 bg-white border border-gray-200 rounded-lg hover:border-brand-400 transition-all text-left group"
                            >
                              <code className="text-[11px] font-mono text-gray-700 truncate flex-1">
                                {p.path}
                              </code>
                              <span className="text-[10px] text-gray-400 truncate max-w-[40%]">
                                {p.sample === null ? 'null' : String(p.sample).slice(0, 30)}
                              </span>
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {customFiltradas.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    Suas variáveis
                  </p>
                  <div className="space-y-1">
                    {customFiltradas.map(v => (
                      <button
                        key={v.variable_key}
                        onClick={() => escolher(`custom.${v.variable_key}`, v.label || v.variable_key)}
                        className="w-full flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">{v.label || v.variable_key}</p>
                          <code className="text-[10px] font-mono text-gray-400">
                            {`{{ custom.${v.variable_key} }}`}
                          </code>
                        </div>
                        <span className="text-[10px] text-gray-300 group-hover:text-brand-500 ml-2 font-medium shrink-0">
                          {inserted === `custom.${v.variable_key}` ? '✓ inserida' : 'inserir'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-[10px] text-gray-400 text-center">
            Clique para inserir no campo ativo
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Uma linha da lista. Para variável de evento mostra o que ela deu no
 * último evento real — é a diferença entre "essa tag existe" e "essa
 * tag vai preencher alguma coisa no seu e-mail".
 */
function TagRow({
  spec, status, inserted, onClick,
}: {
  spec: CatalogTag
  status?: EventTagStatus
  inserted: boolean
  onClick: () => void
}) {
  const resolvido = status?.resolved
  const temValor = Boolean(resolvido?.value)
  const remapeada = Boolean(status?.mappedPaths?.length)

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start justify-between gap-2 p-2.5 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-medium text-gray-800">{spec.label}</p>
          {resolvido && (
            temValor ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-px rounded">
                <CheckCircle2 className="w-2.5 h-2.5" /> resolve
              </span>
            ) : (
              <span
                className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-px rounded"
                title="O último evento deste gatilho não trouxe esse campo. Você pode apontar a variável para outro campo em Integrações → Variáveis."
              >
                sem dado
              </span>
            )
          )}
          {remapeada && (
            <span
              className="text-[9px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-1 py-px rounded"
              title="Esta variável foi apontada para um campo personalizado"
            >
              mapeada
            </span>
          )}
        </div>
        <code className="text-[10px] font-mono text-gray-400 block mt-0.5 truncate">
          {`{{ ${spec.tag} }}`}
        </code>
        <p className="text-[10px] text-gray-400 truncate mt-0.5">
          {temValor ? `Agora: ${resolvido!.value}` : spec.description || `Ex: ${spec.sample}`}
        </p>
      </div>
      <span className="text-[10px] text-gray-300 group-hover:text-brand-500 font-medium shrink-0 mt-0.5">
        {inserted ? '✓ inserida' : 'inserir'}
      </span>
    </button>
  )
}

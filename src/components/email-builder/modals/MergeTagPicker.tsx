'use client'

import { useState, useMemo, useEffect } from 'react'
import { X, Search, User, Store, Package, ShoppingCart, Tag, Link, Zap, ShoppingBag, AlertCircle, Sparkles, Database, Loader2, type LucideIcon } from 'lucide-react'
import { MERGE_TAGS } from '../config/merge-tags'

const MERGE_ICON_MAP: Record<string, LucideIcon> = {
  User, Store, Package, ShoppingCart, Tag, Link, Zap, ShoppingBag, Sparkles, Database,
}

// Canonical merge-tag spec — the STABLE cross-integration set. Clean form is
// un-prefixed ({{ CheckoutURL }}); resolveTriggerSmartTags resolves these both
// un-prefixed AND via the legacy {{ trigger.* }} alias. Kept at module scope so
// the auto-discovered "Tags do Gatilho" group can dedup against it.
const CANONICAL_SPEC: { tag: string; path: string; description: string }[] = [
  { tag: 'CheckoutURL', path: 'CheckoutURL', description: 'Link de recuperação do checkout.' },
  { tag: 'ProductURL', path: 'ProductURL', description: 'URL do produto.' },
  { tag: 'OrderStatusURL', path: 'OrderStatusURL', description: 'Página de status do pedido.' },
  { tag: 'TotalPrice', path: 'TotalPrice', description: 'Total do checkout/pedido.' },
  { tag: 'SubtotalPrice', path: 'SubtotalPrice', description: 'Subtotal antes de taxas.' },
  { tag: 'Currency', path: 'Currency', description: 'Moeda (BRL, USD, GBP).' },
  { tag: 'ItemCount', path: 'ItemCount', description: 'Quantidade total de itens.' },
  { tag: 'OrderNumber', path: 'OrderNumber', description: 'Número do pedido.' },
  { tag: 'OrderID', path: 'OrderID', description: 'ID do pedido.' },
  { tag: 'CheckoutID', path: 'CheckoutID', description: 'ID do checkout.' },
  { tag: 'Customer.Email', path: 'Customer.Email', description: 'Email do cliente.' },
  { tag: 'Customer.FirstName', path: 'Customer.FirstName', description: 'Primeiro nome.' },
  { tag: 'Customer.LastName', path: 'Customer.LastName', description: 'Sobrenome.' },
  { tag: 'Customer.FullName', path: 'Customer.FullName', description: 'Nome completo.' },
  { tag: 'Customer.Phone', path: 'Customer.Phone', description: 'Telefone.' },
  { tag: 'Customer.TotalOrders', path: 'Customer.TotalOrders', description: 'Total de pedidos do cliente.' },
  { tag: 'Customer.TotalSpent', path: 'Customer.TotalSpent', description: 'Total gasto pelo cliente.' },
  { tag: 'Items[0].ProductName', path: 'Items[0].ProductName', description: 'Nome do primeiro produto.' },
  { tag: 'Items[0].ItemPrice', path: 'Items[0].ItemPrice', description: 'Preço do primeiro produto.' },
  { tag: 'Items[0].ImageURL', path: 'Items[0].ImageURL', description: 'Imagem do primeiro produto.' },
  { tag: 'Items[0].ProductURL', path: 'Items[0].ProductURL', description: 'Link do primeiro produto.' },
  { tag: 'Items[0].Quantity', path: 'Items[0].Quantity', description: 'Quantidade do primeiro produto.' },
  { tag: 'FinancialStatus', path: 'FinancialStatus', description: 'Status financeiro.' },
  { tag: 'FulfillmentStatus', path: 'FulfillmentStatus', description: 'Status de envio.' },
  { tag: 'Tracking.Number', path: 'Tracking.Number', description: 'Código de rastreio.' },
  { tag: 'Tracking.URL', path: 'Tracking.URL', description: 'Link de rastreio.' },
  { tag: 'BillingAddress.City', path: 'BillingAddress.City', description: 'Cidade de cobrança.' },
  { tag: 'ShippingAddress.City', path: 'ShippingAddress.City', description: 'Cidade de entrega.' },
  { tag: 'DiscountCodes', path: 'DiscountCodes', description: 'Cupons aplicados.' },
]
const CANONICAL_PATH_SET = new Set(CANONICAL_SPEC.map(s => s.path))

interface MergeTagPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (tagValue: string) => void
  context?: 'campaign' | 'automation'
  triggerType?: string
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
  category: string
  variable_type: string
  path: string
  applicable_triggers: string[] | null
  enabled: boolean
}

export function MergeTagPicker({ isOpen, onClose, onSelect, context, triggerType }: MergeTagPickerProps) {
  const [search, setSearch] = useState('')
  const [copiedTag, setCopiedTag] = useState('')
  const [discovered, setDiscovered] = useState<DiscoveredPath[]>([])
  const [customVars, setCustomVars] = useState<CustomVariable[]>([])
  const [loadingDynamic, setLoadingDynamic] = useState(false)

  const isAutomation = context === 'automation'

  // Fetch event-specific paths from recent events for the active trigger.
  // Same source as /settings/variables — auto-discovers every leaf in
  // properties + properties.raw so the merchant sees EVERY field
  // Shopify is sending right now, not just the static MERGE_TAGS list.
  useEffect(() => {
    if (!isOpen || !isAutomation || !triggerType) {
      setDiscovered([])
      return
    }
    let cancelled = false
    setLoadingDynamic(true)
    Promise.all([
      fetch(`/api/automations/variables/discover?triggerType=${encodeURIComponent(triggerType)}`)
        .then(r => r.ok ? r.json() : { paths: [] })
        .catch(() => ({ paths: [] })),
      fetch('/api/automations/variables/custom')
        .then(r => r.ok ? r.json() : { variables: [] })
        .catch(() => ({ variables: [] })),
    ]).then(([disc, cust]) => {
      if (cancelled) return
      setDiscovered(disc.paths || [])
      // Filter custom vars by applicable_triggers
      const all: CustomVariable[] = cust.variables || []
      const filtered = all.filter(v =>
        v.enabled &&
        (!v.applicable_triggers || v.applicable_triggers.length === 0 || v.applicable_triggers.includes(triggerType))
      )
      setCustomVars(filtered)
    }).finally(() => {
      if (!cancelled) setLoadingDynamic(false)
    })
    return () => { cancelled = true }
  }, [isOpen, isAutomation, triggerType])

  // Build a virtual "Tags do Gatilho" group from auto-discovered paths.
  // Clean namespace: each payload leaf becomes {{ event.<path> }} (the same
  // syntax EmailPreviewMode's tree copies and resolveTriggerSmartTags
  // resolves). The legacy {{ trigger.<path> }} form still resolves as an
  // alias for templates built before this change. Paths already covered by
  // the canonical group are de-duplicated out so each field appears once.
  const triggerGroup = useMemo(() => {
    if (!isAutomation || discovered.length === 0) return null
    const cleaned = discovered
      .map(d => ({ d, clean: d.path.replace(/^trigger\./, '') }))
      .filter(({ clean }) => !CANONICAL_PATH_SET.has(clean))
    if (cleaned.length === 0) return null
    return {
      name: `Tags do Gatilho (${cleaned.length})`,
      icon: 'Zap',
      tags: cleaned.map(({ d, clean }) => ({
        name: clean,
        value: `{{ event.${clean} }}`,
        sample: d.sample === null
          ? 'null'
          : typeof d.sample === 'object'
            ? JSON.stringify(d.sample).slice(0, 60)
            : String(d.sample).slice(0, 60),
        hint: d.type,
      })),
    }
  }, [isAutomation, discovered])

  const customGroup = useMemo(() => {
    if (customVars.length === 0) return null
    return {
      name: `Variáveis Personalizadas (${customVars.length})`,
      icon: 'Sparkles',
      tags: customVars.map(v => ({
        name: v.label || v.variable_key,
        value: `{{ custom.${v.variable_key} }}`,
        sample: v.description || v.path,
        hint: v.variable_type,
      })),
    }
  }, [customVars])

  // Canonical merge tags — the STABLE set merchants can rely on. These
  // resolve identically across every integration source (Shopify pixel,
  // Shopify webhook, future Yampi / WooCommerce). Templates built with
  // these names work forever without modification.
  const canonicalGroup = useMemo(() => {
    if (!isAutomation) return null
    return {
      name: `Tags Worder (canônicas) (${CANONICAL_SPEC.length})`,
      icon: 'Zap',
      tags: CANONICAL_SPEC.map(s => ({
        // Canonical form is un-prefixed ({{ CheckoutURL }}). The send
        // pipeline (resolveTriggerSmartTags) resolves the whitelist both
        // un-prefixed and via the legacy {{ trigger.* }} alias, so existing
        // templates keep working while new ones stay clean/portable.
        name: s.tag,
        value: `{{ ${s.path} }}`,
        sample: s.description,
        hint: 'sempre disponível',
      })),
    }
  }, [isAutomation])

  const availableGroups = useMemo(() => {
    const baseGroups = MERGE_TAGS

    // Stitch the dynamic groups in: canonical Worder tags first (always
    // safe to use, never break across integrations), then trigger-
    // discovered tags (rich source-specific paths), then custom
    // shortcuts, then the static catalog.
    let groups: any[] = []
    if (canonicalGroup) groups.push(canonicalGroup)
    if (triggerGroup) groups.push(triggerGroup)
    if (customGroup) groups.push(customGroup)
    groups = groups.concat(
      isAutomation ? baseGroups : baseGroups.filter(g => !g.name.includes('Evento'))
    )

    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.map(group => ({
      ...group,
      tags: group.tags.filter((t: any) =>
        t.name.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        (t.sample && String(t.sample).toLowerCase().includes(q))
      ),
    })).filter(g => g.tags.length > 0)
  }, [search, isAutomation, triggerGroup, customGroup, canonicalGroup])

  const handleSelect = (value: string) => {
    onSelect(value)
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiedTag(value)
    setTimeout(() => setCopiedTag(''), 1500)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Merge Tags</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tag..."
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
              autoFocus
            />
          </div>
        </div>

        {/* Context banner */}
        {isAutomation && (
          <div className="mx-4 mt-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-violet-700">
              <strong>Tags do Gatilho</strong> são auto-detectadas dos eventos recentes
              {triggerType ? ` de ${triggerType}` : ''} — todas as propriedades disponíveis no payload aparecem aqui em tempo real.
              {loadingDynamic && <Loader2 className="w-3 h-3 inline-block ml-1 animate-spin" />}
            </p>
          </div>
        )}

        {/* Tags list */}
        <div className="flex-1 overflow-y-auto p-3">
          {availableGroups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">Nenhuma tag encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {availableGroups.map(group => (
                <div key={group.name}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-2 flex items-center gap-1">
                    {(() => { const MIcon = MERGE_ICON_MAP[group.icon]; return MIcon ? <MIcon className="w-3 h-3 text-gray-400" /> : null })()}{group.name}
                  </p>
                  <div className="space-y-1">
                    {group.tags.map((tag: any) => (
                      <button
                        key={tag.value}
                        onClick={() => handleSelect(tag.value)}
                        className="w-full flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-gray-800 truncate">{tag.name}</p>
                            <code className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0 truncate max-w-[180px]">{tag.value}</code>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {tag.sample && (
                              <p className="text-[10px] text-gray-400 truncate">Ex: {tag.sample}</p>
                            )}
                            {tag.hint && (
                              <p className="text-[10px] text-violet-500 shrink-0">{tag.hint}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-300 group-hover:text-brand-500 flex-shrink-0 ml-2 transition-colors font-medium">
                          {copiedTag === tag.value ? '✓ copiado' : 'inserir'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-[10px] text-gray-400 text-center">Clique em uma tag para inserir no campo ativo</p>
        </div>
      </div>
    </div>
  )
}

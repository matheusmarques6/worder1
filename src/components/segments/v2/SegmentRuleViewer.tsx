'use client'

// Human-readable read-only view of a SegmentRule. Used by the segment
// detail page's Definition tab. Renders the tree as a nested
// AND/OR list with each leaf condition phrased in PT-BR.
//
// Example output:
//   ALL of:
//   • Predicted CLV é maior ou igual a 500
//   • Fez pedido pelo menos 1 vez nos últimos 30 dias
//     onde Valor total é maior que 100
//   • Está na lista "VIPs Black Friday"

import type { SegmentRule, RuleGroup, RuleLeaf, ProfileRule, EventRule, EventFunnelRule, AnniversaryRule, ConsentRule, ListMembershipRule, SegmentMembershipRule, TimeWindow, PropertyFilter } from '@/lib/segments/dsl'
import { FIELD_INDEX, OPERATOR_LABELS } from '@/lib/segments/catalog'

interface Props {
  rule: SegmentRule
  // Optional: maps for resolving list/segment ids to names. Without
  // them we render the raw uuid as a fallback.
  listNames?: Record<string, string>
  segmentNames?: Record<string, string>
}

export function SegmentRuleViewer({ rule, listNames, segmentNames }: Props) {
  if (!rule?.root?.children?.length) {
    return <p className="text-sm text-gray-400 py-2">Nenhuma condição definida</p>
  }
  return (
    <div className="space-y-2">
      <GroupView group={rule.root} depth={0} listNames={listNames} segmentNames={segmentNames} />
    </div>
  )
}

function GroupView({ group, depth, listNames, segmentNames }: {
  group: RuleGroup
  depth: number
  listNames?: Record<string, string>
  segmentNames?: Record<string, string>
}) {
  const isRoot = depth === 0
  const wrapper = isRoot ? '' : 'pl-3 border-l-2 border-gray-200'
  return (
    <div className={wrapper}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
        {group.logic === 'AND' ? 'TODAS as condições:' : 'QUALQUER uma das condições:'}
      </p>
      <ul className="space-y-1.5 pl-3">
        {group.children.map((child, i) => (
          <li key={i} className="text-sm text-gray-700">
            {child.type === 'group' ? (
              <GroupView group={child} depth={depth + 1} listNames={listNames} segmentNames={segmentNames} />
            ) : (
              <LeafView leaf={child} listNames={listNames} segmentNames={segmentNames} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LeafView({ leaf, listNames, segmentNames }: {
  leaf: RuleLeaf
  listNames?: Record<string, string>
  segmentNames?: Record<string, string>
}) {
  switch (leaf.type) {
    case 'profile':       return <ProfileLeafView leaf={leaf} />
    case 'event':         return <EventLeafView leaf={leaf} />
    case 'event_funnel':  return <FunnelLeafView leaf={leaf} />
    case 'anniversary':   return <AnniversaryLeafView leaf={leaf} />
    case 'consent':       return <ConsentLeafView leaf={leaf} />
    case 'list_membership':
      return <span>• Está {leaf.is_member ? '' : 'NÃO está '}na lista <strong>{listNames?.[leaf.list_id] || leaf.list_id}</strong></span>
    case 'segment_membership':
      return <span>• Está {leaf.is_member ? '' : 'NÃO está '}no segmento <strong>{segmentNames?.[leaf.segment_id] || leaf.segment_id}</strong></span>
    case 'location':
      return <span>• Localização (geo) — preview indisponível</span>
    default:
      return null
  }
}

const MONTH_LABELS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function ProfileLeafView({ leaf }: { leaf: ProfileRule }) {
  const def = FIELD_INDEX[leaf.field]
  const fieldLabel = def?.label || leaf.field
  const opLabel = OPERATOR_LABELS[leaf.operator] || leaf.operator
  // Month / day-of-month operators expect arrays of integers; we
  // localize them so 'month_in [3,5]' reads 'Mar, Mai' instead of 3,5.
  let valueLabel: string
  if (leaf.operator === 'month_in' && Array.isArray(leaf.value)) {
    valueLabel = (leaf.value as any[]).map((m) => MONTH_LABELS_PT[Number(m) - 1] || String(m)).join(', ')
  } else if (leaf.operator === 'day_of_month_in' && Array.isArray(leaf.value)) {
    valueLabel = (leaf.value as any[]).map(String).join(', ')
  } else {
    valueLabel = formatValue(def, leaf.value, leaf.value2, leaf.unit)
  }
  return (
    <span>
      • <strong>{fieldLabel}</strong> {opLabel} {valueLabel && <strong>{valueLabel}</strong>}
    </span>
  )
}

function EventLeafView({ leaf }: { leaf: EventRule }) {
  const def = FIELD_INDEX[leaf.event]
  const eventLabel = def?.label || leaf.event
  const freq = formatFrequency(leaf.frequency)
  const window = formatWindow(leaf.window)
  const filters = leaf.property_filters?.length
    ? <ul className="ml-4 mt-1 space-y-0.5 text-xs text-gray-600">
        {leaf.property_filters.map((pf, i) => (
          <li key={i}>↳ onde {formatPropertyFilter(def, pf)}</li>
        ))}
      </ul>
    : null
  return (
    <>
      <span>• <strong>{eventLabel}</strong> {freq} {window}</span>
      {filters}
    </>
  )
}

function FunnelLeafView({ leaf }: { leaf: EventFunnelRule }) {
  return (
    <div>
      <span>• <strong>Funil de eventos</strong> {formatWindow(leaf.window)}:</span>
      <ol className="ml-4 mt-1 space-y-0.5 text-xs text-gray-600 list-decimal list-inside">
        {leaf.steps.map((step, i) => {
          const def = FIELD_INDEX[step.event]
          return (
            <li key={i}>
              {step.negate ? <strong>NÃO</strong> : ''} {def?.label || step.event}
            </li>
          )
        })}
      </ol>
      {leaf.max_step_gap_days && (
        <p className="ml-4 text-xs text-gray-500">Cada passo até {leaf.max_step_gap_days} dias após o anterior.</p>
      )}
    </div>
  )
}

function AnniversaryLeafView({ leaf }: { leaf: AnniversaryRule }) {
  const def = FIELD_INDEX[leaf.field]
  return (
    <span>
      • <strong>{def?.label || leaf.field}</strong> acontece nos próximos <strong>{leaf.within_next_days} dias</strong>
    </span>
  )
}

function ConsentLeafView({ leaf }: { leaf: ConsentRule }) {
  const channelLabel = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push' }[leaf.channel]
  const statusLabel = {
    can_receive: 'pode receber',
    cannot_receive: 'não pode receber',
    subscribed: 'está inscrito em',
    unsubscribed: 'descadastrou de',
    pending: 'consent pendente em',
  }[leaf.status]
  return <span>• Contato <strong>{statusLabel}</strong> <strong>{channelLabel}</strong></span>
}

// ────────────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────────────

function formatValue(def: any, value: unknown, value2: unknown, unit?: string): string {
  if (value === undefined || value === null || value === '') return ''
  if (def?.enumValues) {
    const opt = def.enumValues.find((e: any) => e.value === value)
    if (opt) return `"${opt.label}"`
    if (Array.isArray(value)) {
      const labels = value.map((v) => def.enumValues.find((e: any) => e.value === v)?.label || v)
      return labels.join(', ')
    }
  }
  if (Array.isArray(value)) return value.map((v) => `"${v}"`).join(', ')
  if (value2 !== undefined && value2 !== null && value2 !== '') {
    return `${value} ${unit ? unit + 's' : ''} e ${value2} ${unit ? unit + 's' : ''}`
  }
  if (unit) return `${value} ${unit === 'day' ? 'dias' : unit === 'week' ? 'semanas' : 'meses'}`
  return String(value)
}

function formatFrequency(freq: EventRule['frequency']): string {
  switch (freq.op) {
    case 'at_least': return `pelo menos ${freq.value} vez${freq.value === 1 ? '' : 'es'}`
    case 'at_most':  return `no máximo ${freq.value} vez${freq.value === 1 ? '' : 'es'}`
    case 'exactly':  return `exatamente ${freq.value} vez${freq.value === 1 ? '' : 'es'}`
    case 'between':  return `entre ${freq.value} e ${freq.value2} vezes`
    case 'zero':     return 'nenhuma vez'
    default:         return ''
  }
}

function formatWindow(window: TimeWindow): string {
  switch (window.kind) {
    case 'all_time':      return 'desde sempre'
    case 'last':          return `nos últimos ${window.value} ${unitLabel(window.unit)}`
    case 'not_in_last':   return `não nos últimos ${window.value} ${unitLabel(window.unit)}`
    case 'before':        return `antes de ${window.date}`
    case 'after':         return `depois de ${window.date}`
    case 'between_dates': return `entre ${window.from} e ${window.to}`
    case 'between_relative': return `entre ${window.from} e ${window.to} dias atrás`
    case 'on_date':       return `na data ${window.date}`
    default: return ''
  }
}

function unitLabel(u: 'day' | 'week' | 'month'): string {
  return u === 'day' ? 'dias' : u === 'week' ? 'semanas' : 'meses'
}

function formatPropertyFilter(eventDef: any, pf: PropertyFilter): string {
  const propLabel = eventDef?.eventProperties?.find((p: any) => p.path === pf.path)?.label || pf.path
  const opLabel = OPERATOR_LABELS[pf.operator] || pf.operator
  const valueLabel = pf.value === undefined || pf.value === null ? '' : String(pf.value)
  return `${propLabel} ${opLabel} ${valueLabel}`
}

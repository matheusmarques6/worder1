'use client'

// RuleRow — one condition in the segment builder. Renders the three
// canonical dropdowns (field / operator / value) plus event-specific
// extras when the field maps to an event_type (frequency + window +
// property sub-filters).
//
// Owns no state; gets the rule shape via props and emits changes
// upward so the parent (RuleGroup → SegmentBuilder) can keep the
// whole rule tree in one place.

import { X, Plus } from 'lucide-react'
import { FIELD_INDEX } from '@/lib/segments/catalog'
import type { FieldDef } from '@/lib/segments/catalog'
import type { RuleLeaf, ProfileRule, EventRule, EventFunnelRule, AnniversaryRule, ConsentRule, ListMembershipRule, PropertyFilter, FrequencyOperator } from '@/lib/segments/dsl'
import { FieldPicker } from './FieldPicker'
import { OperatorPicker } from './OperatorPicker'
import { ValueInput } from './ValueInput'

interface Props {
  rule: RuleLeaf
  onChange: (next: RuleLeaf) => void
  onRemove: () => void
  lists?: Array<{ id: string; name: string }>
}

export function RuleRow({ rule, onChange, onRemove, lists }: Props) {
  if (rule.type === 'event') {
    return <EventRuleRow rule={rule} onChange={onChange as any} onRemove={onRemove} />
  }
  if (rule.type === 'event_funnel') {
    return <EventFunnelRow rule={rule} onChange={onChange as any} onRemove={onRemove} />
  }
  if (rule.type === 'anniversary') {
    return <AnniversaryRow rule={rule} onChange={onChange as any} onRemove={onRemove} />
  }
  if (rule.type === 'list_membership') {
    return <ListMembershipRow rule={rule} onChange={onChange as any} onRemove={onRemove} lists={lists} />
  }
  if (rule.type === 'consent') {
    return <ConsentRow rule={rule} onChange={onChange as any} onRemove={onRemove} />
  }
  return <ProfileRuleRow rule={rule as ProfileRule} onChange={onChange as any} onRemove={onRemove} />
}

// ────────────────────────────────────────────────────────────────────
// Profile rule
// ────────────────────────────────────────────────────────────────────

function ProfileRuleRow({ rule, onChange, onRemove }: {
  rule: ProfileRule
  onChange: (next: RuleLeaf) => void
  onRemove: () => void
}) {
  const def = rule.field ? FIELD_INDEX[rule.field] : null

  // When the user picks an event field accidentally on the profile row,
  // we silently re-shape the rule into an EventRule. This keeps the UI
  // forgiving — they pick "Placed Order" expecting it to "just work."
  function pickField(key: string) {
    const f = FIELD_INDEX[key]
    if (!f) return
    if (f.source.kind === 'event') {
      onChange({
        type: 'event',
        event: f.source.event_type,
        frequency: { op: 'at_least', value: 1 },
        window: { kind: 'all_time' },
      } satisfies EventRule)
    } else {
      onChange({ type: 'profile', field: key, operator: rule.operator, value: undefined })
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
      <div className="grid grid-cols-[minmax(180px,1fr)_minmax(140px,200px)_minmax(180px,2fr)_auto] gap-2 items-start">
        <FieldPicker value={rule.field || null} onChange={pickField} />
        <OperatorPicker
          fieldType={def?.type || null}
          value={rule.operator || null}
          onChange={(op) => onChange({ ...rule, operator: op as ProfileRule['operator'] })}
        />
        <ValueInput
          field={def}
          operator={rule.operator || null}
          value={rule.value}
          value2={rule.value2}
          unit={rule.unit}
          onChange={(patch) => onChange({ ...rule, ...patch } as ProfileRule)}
        />
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-1"
          title="Remover filtro"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Event rule — Klaviyo-style with frequency + window + sub-filters
// ────────────────────────────────────────────────────────────────────

function EventRuleRow({ rule, onChange, onRemove }: {
  rule: EventRule
  onChange: (next: RuleLeaf) => void
  onRemove: () => void
}) {
  const def = FIELD_INDEX[rule.event] || null

  // Convert event def's property list into FieldDef shape so the
  // sub-filter picker can reuse the FieldPicker component.
  const eventProperties: FieldDef[] = (def?.eventProperties || []).map((p) => ({
    key: p.path,
    label: p.label,
    type: p.type,
    category: 'custom' as const,
    source: { kind: 'contact_column' as const, column: p.path },
  }))

  function pickEvent(key: string) {
    const f = FIELD_INDEX[key]
    if (!f) return
    // Switching to a non-event field collapses the row back to a profile rule.
    if (f.source.kind !== 'event') {
      onChange({ type: 'profile', field: key, operator: 'equals', value: undefined })
      return
    }
    onChange({ ...rule, event: f.source.event_type, property_filters: [] })
  }

  function updateFrequency(patch: Partial<EventRule['frequency']>) {
    onChange({ ...rule, frequency: { ...rule.frequency, ...patch } })
  }

  function updateWindow(next: EventRule['window']) {
    onChange({ ...rule, window: next })
  }

  function updateFilter(i: number, next: PropertyFilter) {
    const filters = [...(rule.property_filters || [])]
    filters[i] = next
    onChange({ ...rule, property_filters: filters })
  }

  function addFilter() {
    onChange({
      ...rule,
      property_filters: [
        ...(rule.property_filters || []),
        { path: eventProperties[0]?.key || '', type: eventProperties[0]?.type || 'string', operator: 'equals' as any, value: '' },
      ],
    })
  }

  function removeFilter(i: number) {
    const filters = (rule.property_filters || []).filter((_, idx) => idx !== i)
    onChange({ ...rule, property_filters: filters })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors space-y-3">
      <div className="grid grid-cols-[minmax(180px,1fr)_auto] gap-2 items-start">
        <FieldPicker value={rule.event} onChange={pickEvent} placeholder="Selecione um evento" />
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-1"
        >
          <X size={14} />
        </button>
      </div>

      {/* Frequency + window line */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">aconteceu</span>
        <select
          value={rule.frequency.op}
          onChange={(e) => updateFrequency({ op: e.target.value as FrequencyOperator })}
          className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-sm"
        >
          <option value="at_least">no mínimo</option>
          <option value="at_most">no máximo</option>
          <option value="exactly">exatamente</option>
          <option value="between">entre</option>
          <option value="zero">nenhuma vez</option>
        </select>
        {rule.frequency.op !== 'zero' && (
          <input
            type="number"
            min={0}
            value={rule.frequency.value}
            onChange={(e) => updateFrequency({ value: Number(e.target.value) })}
            className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm"
          />
        )}
        {rule.frequency.op === 'between' && (
          <>
            <span className="text-gray-500">e</span>
            <input
              type="number"
              min={0}
              value={rule.frequency.value2 ?? 0}
              onChange={(e) => updateFrequency({ value2: Number(e.target.value) })}
              className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm"
            />
          </>
        )}
        {rule.frequency.op !== 'zero' && <span className="text-gray-500">vez(es)</span>}

        <WindowSelect window={rule.window} onChange={updateWindow} />
      </div>

      {/* Property sub-filters */}
      {eventProperties.length > 0 && (rule.property_filters?.length ?? 0) > 0 && (
        <div className="pl-4 border-l-2 border-brand-100 space-y-2">
          {(rule.property_filters || []).map((pf, i) => (
            <PropertyFilterRow
              key={i}
              eventProperties={eventProperties}
              filter={pf}
              onChange={(next) => updateFilter(i, next)}
              onRemove={() => removeFilter(i)}
            />
          ))}
        </div>
      )}

      {eventProperties.length > 0 && (
        <button
          type="button"
          onClick={addFilter}
          className="text-xs text-brand-500 hover:text-brand-700 inline-flex items-center gap-1"
        >
          <Plus size={12} />
          {(rule.property_filters?.length ?? 0) > 0 ? 'Adicionar outro filtro de propriedade' : 'Adicionar filtro de propriedade'}
        </button>
      )}
    </div>
  )
}

function WindowSelect({ window, onChange }: { window: EventRule['window']; onChange: (w: EventRule['window']) => void }) {
  const kind = window.kind
  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={kind}
        onChange={(e) => {
          const k = e.target.value as EventRule['window']['kind']
          if (k === 'all_time') onChange({ kind: 'all_time' })
          else if (k === 'last') onChange({ kind: 'last', value: 30, unit: 'day' })
          else if (k === 'before') onChange({ kind: 'before', date: new Date().toISOString().slice(0, 10) })
          else if (k === 'after') onChange({ kind: 'after', date: new Date().toISOString().slice(0, 10) })
          else if (k === 'between_dates') onChange({ kind: 'between_dates', from: '', to: '' })
        }}
        className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-sm"
      >
        <option value="all_time">desde sempre</option>
        <option value="last">nos últimos</option>
        <option value="before">antes de</option>
        <option value="after">depois de</option>
        <option value="between_dates">entre datas</option>
      </select>

      {kind === 'last' && (
        <>
          <input
            type="number"
            min={0}
            value={(window as any).value}
            onChange={(e) => onChange({ ...window, value: Number(e.target.value) } as any)}
            className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm"
          />
          <select
            value={(window as any).unit}
            onChange={(e) => onChange({ ...window, unit: e.target.value } as any)}
            className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-sm"
          >
            <option value="day">dias</option>
            <option value="week">semanas</option>
            <option value="month">meses</option>
          </select>
        </>
      )}

      {(kind === 'before' || kind === 'after') && (
        <input
          type="date"
          value={(window as any).date || ''}
          onChange={(e) => onChange({ ...window, date: e.target.value } as any)}
          className="px-2 py-1 border border-gray-200 rounded-lg text-sm"
        />
      )}

      {kind === 'between_dates' && (
        <>
          <input
            type="date"
            value={(window as any).from || ''}
            onChange={(e) => onChange({ ...window, from: e.target.value } as any)}
            className="px-2 py-1 border border-gray-200 rounded-lg text-sm"
          />
          <span className="text-gray-400">e</span>
          <input
            type="date"
            value={(window as any).to || ''}
            onChange={(e) => onChange({ ...window, to: e.target.value } as any)}
            className="px-2 py-1 border border-gray-200 rounded-lg text-sm"
          />
        </>
      )}
    </div>
  )
}

function PropertyFilterRow({
  eventProperties,
  filter,
  onChange,
  onRemove,
}: {
  eventProperties: FieldDef[]
  filter: PropertyFilter
  onChange: (next: PropertyFilter) => void
  onRemove: () => void
}) {
  const def = eventProperties.find((p) => p.key === filter.path) || null
  return (
    <div className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,160px)_minmax(140px,2fr)_auto] gap-2 items-start">
      <FieldPicker
        value={filter.path}
        onChange={(k) => {
          const found = eventProperties.find((p) => p.key === k)
          onChange({ ...filter, path: k, type: found?.type || 'string' })
        }}
        customFields={eventProperties}
        placeholder="Propriedade"
        compact
      />
      <OperatorPicker
        fieldType={def?.type || null}
        value={filter.operator}
        onChange={(op) => onChange({ ...filter, operator: op as any })}
        compact
      />
      <ValueInput
        field={def}
        operator={filter.operator}
        value={filter.value}
        value2={filter.value2}
        onChange={(patch) => onChange({ ...filter, ...patch })}
        compact
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// List membership
// ────────────────────────────────────────────────────────────────────

function ListMembershipRow({ rule, onChange, onRemove, lists }: {
  rule: ListMembershipRule
  onChange: (next: RuleLeaf) => void
  onRemove: () => void
  lists?: Array<{ id: string; name: string }>
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
      <div className="grid grid-cols-[minmax(140px,1fr)_minmax(160px,1fr)_minmax(220px,2fr)_auto] gap-2 items-center">
        <span className="text-sm text-gray-700">Está na lista</span>
        <select
          value={rule.is_member ? 'yes' : 'no'}
          onChange={(e) => onChange({ ...rule, is_member: e.target.value === 'yes' })}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
        >
          <option value="yes">sim</option>
          <option value="no">não</option>
        </select>
        <select
          value={rule.list_id}
          onChange={(e) => onChange({ ...rule, list_id: e.target.value })}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
        >
          <option value="">Selecione uma lista…</option>
          {(lists || []).map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Consent
// ────────────────────────────────────────────────────────────────────

function ConsentRow({ rule, onChange, onRemove }: {
  rule: ConsentRule
  onChange: (next: RuleLeaf) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
      <div className="grid grid-cols-[minmax(120px,1fr)_minmax(140px,1fr)_minmax(180px,2fr)_auto] gap-2 items-center">
        <span className="text-sm text-gray-700">Pode receber</span>
        <select
          value={rule.channel}
          onChange={(e) => onChange({ ...rule, channel: e.target.value as ConsentRule['channel'] })}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="push">Push</option>
        </select>
        <select
          value={rule.status}
          onChange={(e) => onChange({ ...rule, status: e.target.value as ConsentRule['status'] })}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
        >
          <option value="can_receive">Pode receber</option>
          <option value="cannot_receive">Não pode receber</option>
          <option value="subscribed">Está inscrito</option>
          <option value="unsubscribed">Descadastrou</option>
          <option value="pending">Aguardando confirmação</option>
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Event funnel — strict-order sequence A → B → not C
// ────────────────────────────────────────────────────────────────────

function EventFunnelRow({ rule, onChange, onRemove }: {
  rule: EventFunnelRule
  onChange: (next: RuleLeaf) => void
  onRemove: () => void
}) {
  function updateStep(i: number, patch: Partial<EventFunnelRule['steps'][number]>) {
    const steps = [...rule.steps]
    steps[i] = { ...steps[i], ...patch }
    onChange({ ...rule, steps })
  }

  function addStep() {
    onChange({ ...rule, steps: [...rule.steps, { event: '', negate: false }] })
  }

  function removeStep(i: number) {
    if (rule.steps.length <= 2) return
    onChange({ ...rule, steps: rule.steps.filter((_, idx) => idx !== i) })
  }

  const eventFields: FieldDef[] = Object.values(FIELD_INDEX).filter((f) => f.source.kind === 'event')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Funil de eventos (sequência)</span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <ol className="space-y-2">
        {rule.steps.map((step, i) => (
          <li key={i} className="grid grid-cols-[24px_minmax(140px,1fr)_minmax(120px,140px)_auto] gap-2 items-center">
            <span className="text-xs font-bold text-gray-400 text-center">{i + 1}</span>
            <FieldPicker
              value={step.event}
              onChange={(k) => {
                const f = FIELD_INDEX[k]
                if (f?.source.kind === 'event') updateStep(i, { event: f.source.event_type })
              }}
              customFields={eventFields}
              placeholder="Selecione evento"
              compact
            />
            <select
              value={step.negate ? 'no' : 'yes'}
              onChange={(e) => updateStep(i, { negate: e.target.value === 'no' })}
              className="px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-sm"
            >
              <option value="yes">aconteceu</option>
              <option value="no">NÃO aconteceu</option>
            </select>
            {rule.steps.length > 2 && (
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button
          type="button"
          onClick={addStep}
          className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
        >
          <Plus size={12} />
          Adicionar passo
        </button>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-600">tudo dentro de</span>
        <select
          value={(rule.window as any).value || 30}
          onChange={(e) => onChange({ ...rule, window: { kind: 'last', value: Number(e.target.value), unit: 'day' } })}
          className="px-2 py-1 border border-gray-200 rounded-lg bg-white text-xs"
        >
          {[1, 3, 7, 14, 30, 60, 90].map((v) => (
            <option key={v} value={v}>{v} dias</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Anniversary — recurring (month, day) match
// ────────────────────────────────────────────────────────────────────

function AnniversaryRow({ rule, onChange, onRemove }: {
  rule: AnniversaryRule
  onChange: (next: RuleLeaf) => void
  onRemove: () => void
}) {
  const dateFields: FieldDef[] = Object.values(FIELD_INDEX).filter((f) => f.type === 'date' && f.source.kind === 'contact_column')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
      <div className="grid grid-cols-[minmax(140px,1fr)_auto_minmax(80px,100px)_minmax(60px,80px)_auto] gap-2 items-center">
        <FieldPicker
          value={rule.field}
          onChange={(k) => onChange({ ...rule, field: k })}
          customFields={dateFields}
          placeholder="Data recorrente"
          compact
        />
        <span className="text-sm text-gray-600 whitespace-nowrap">acontece em</span>
        <input
          type="number"
          min={0}
          value={rule.within_next_days}
          onChange={(e) => onChange({ ...rule, within_next_days: Number(e.target.value) })}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
        />
        <span className="text-sm text-gray-600">dias</span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

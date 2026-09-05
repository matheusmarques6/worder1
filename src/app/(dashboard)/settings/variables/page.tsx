'use client'

// Configurações → Variáveis (desenho PVars v3): catálogo Perfil / Evento / Loja,
// propriedades personalizadas dos contatos, filtros e — do fluxo anterior —
// campos detectados nos eventos e atalhos personalizados.

import { Fragment, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, Title, LoadingCard, Modal, Field, IconBtn, Pill, Code, useCopy } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, nf } from '@/components/settings/format'
import { useApi, useAction } from '@/components/settings/hooks'
import { MERGE_TAGS } from '@/lib/email/merge-tags'

type Tab = 'Perfil' | 'Evento' | 'Loja'
const TAB_OF: Record<string, Tab> = { contact: 'Perfil', purchases: 'Perfil', last_order: 'Evento', cart: 'Evento', event: 'Evento', store: 'Loja', system: 'Loja', custom: 'Perfil' }
const GROUP_OF: Record<string, string> = { contact: 'Identificação', purchases: 'Comportamento', last_order: 'Último pedido', cart: 'Checkout abandonado', event: 'Evento da automação', store: 'Organização', system: 'Mensagem', custom: 'Personalizado' }
const TABS: Tab[] = ['Perfil', 'Evento', 'Loja']

const TRIGGERS: Array<[string, string]> = [['trigger_order', 'Pedido criado'], ['trigger_checkout_abandoned', 'Checkout abandonado'], ['trigger_checkout_completed', 'Checkout completado'], ['trigger_fulfilled_order', 'Pedido enviado'], ['trigger_cancelled_order', 'Pedido cancelado'], ['trigger_refunded_order', 'Pedido reembolsado'], ['trigger_viewed_product', 'Visualizou produto'], ['trigger_added_to_cart', 'Adicionou ao carrinho'], ['trigger_browse_abandoned', 'Navegação abandonada'], ['trigger_back_in_stock', 'Voltou em estoque'], ['trigger_form_submitted', 'Formulário enviado']]
const PROP_TYPES: Array<[string, string]> = [['text', 'Texto'], ['number', 'Número'], ['date', 'Data'], ['boolean', 'Sim/Não'], ['select', 'Lista'], ['url', 'URL'], ['email', 'E-mail'], ['phone', 'Telefone']]

interface Prop { id: string; key: string; label: string; type: string; type_label: string; filled: number; active: boolean }
interface CustomVar { id: string; variable_key: string; label: string; description: string | null; path: string; fallback_path: string | null; default_value: string | null; variable_type: string; enabled: boolean }

export default function VariablesSettingsPage() {
  const [tab, setTab] = useState<Tab>('Perfil')
  const [q, setQ] = useState('')
  const [c, cp] = useCopy()
  const ql = q.trim().toLowerCase()
  const groups = useMemo(() => {
    const out = new Map<string, typeof MERGE_TAGS>()
    for (const t of MERGE_TAGS) {
      if (TAB_OF[t.category] !== tab) continue
      if (ql && !`${t.tag} ${t.label} ${t.sampleValue} ${t.description || ''}`.toLowerCase().includes(ql)) continue
      const g = GROUP_OF[t.category] || t.category
      if (!out.has(g)) out.set(g, [])
      out.get(g)!.push(t)
    }
    return Array.from(out.entries())
  }, [tab, ql])

  return (
    <>
      <Title h="Variáveis" p="Personalize e-mails, WhatsApp e SMS com dados do contato, do evento e da loja. Clique para copiar e cole no editor." right={<a href="https://docs.worder.com.br/variaveis" target="_blank" rel="noreferrer" className="lnk">Guia de sintaxe<I n="chevR" s={15} /></a>} />
      <Card flush>
        <div className="vtabs">
          {TABS.map((t) => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
          <label className="st-search" style={{ marginLeft: 'auto', alignSelf: 'center', width: 240, height: 34 }}><I n="search" s={15} /><input placeholder="Buscar variável…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar variável" /></label>
        </div>
        <div className="vrow2" style={{ borderTop: 'none', padding: '8px 24px', fontSize: 12.5, color: 'var(--text-3)' }}><span>Variável</span><span className="d">Descrição</span><span className="e">Exemplo</span><span></span></div>
        {groups.map(([g, rows]) => (
          <Fragment key={g}>
            <div className="vgrp">{g}</div>
            {rows.map((r) => (
              <div key={r.tag} className="vrow2">
                <code>{`{{ ${r.tag} }}`}</code><span className="d">{r.label}{r.description ? ` — ${r.description}` : ''}</span><span className="e">{r.sampleValue}</span>
                <button type="button" className={'cpb' + (c === r.tag ? ' ok' : '')} style={{ height: 30 }} onClick={() => cp(r.tag, `{{ ${r.tag} }}`)}>{c === r.tag ? <><I n="check" s={13} />Copiado</> : <><I n="copy" s={13} />Copiar</>}</button>
              </div>
            ))}
          </Fragment>
        ))}
        {!groups.length && <div className="empty2">Nenhuma variável encontrada para “{q}”.</div>}
      </Card>

      <PropertiesCard />
      <EventFieldsCard />
      <ShortcutsCard />

      <Card title="Filtros e padrões" desc="Trate valores vazios e formate números e datas.">
        <Row label="Valor padrão"><Code>{`Olá {{ first_name | default: "cliente" }}!`}</Code></Row>
        <Row label="Moeda"><Code>{`{{ order_total | money: "BRL" }}  →  R$ 74,20`}</Code></Row>
        <Row label="Data"><Code>{`{{ last_order_at | date: "%d/%m/%Y" }}  →  27/08/2026`}</Code></Row>
      </Card>
    </>
  )
}

function PropertiesCard() {
  const { data, loading, error, reload } = useApi<{ properties: Prop[]; detected: Array<{ key: string; sample: number }> }>('/api/settings/variables')
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [modal, setModal] = useState<{ prop?: Prop; key?: string } | null>(null)
  const remove = async (p: Prop) => {
    if (!(await confirm.confirm({ title: `Excluir a propriedade “${p.label}”?`, description: 'Os valores já gravados nos contatos continuam, mas a propriedade deixa de aparecer em filtros e formulários.', confirmLabel: 'Excluir', destructive: true }))) return
    await run(`d-${p.id}`, async () => { await api('/api/settings/variables', { method: 'DELETE', json: { id: p.id } }); await reload(true) }, { success: 'Propriedade excluída' })
  }
  return (
    <>
      <Card title="Propriedades personalizadas" desc="Campos próprios de cada contato. Use como {{ custom.nome }}." right={<button type="button" className="btn btn-sm" onClick={() => setModal({})}><I n="plus" s={14} />Nova propriedade</button>} flush>
        {loading && !data ? <div className="sc-b"><div className="sk w60" /><div className="sk w40" /></div> : error ? <div className="empty2">{error}</div> : (
          <>
            {data!.properties.length === 0 && data!.detected.length === 0 ? <div className="empty2"><b>Nenhuma propriedade</b>Crie campos como tipo_cabelo ou data_nascimento e use nos e-mails e segmentos.</div> : (
              <div className="tw"><table className="stbl">
                <thead><tr><th>Propriedade</th><th>Tipo</th><th className="hm">Preenchida em</th><th></th></tr></thead>
                <tbody>
                  {data!.properties.map((p) => (
                    <tr key={p.id}>
                      <td className="fx"><span className="nm" style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--acc-ink)' }}>{`{{ custom.${p.key} }}`}</span><span className="mt">{p.label}</span></td>
                      <td><Pill>{p.type_label}</Pill></td>
                      <td className="hm" style={{ color: 'var(--text-3)' }}>{nf(p.filled)} contatos</td>
                      <td className="r"><div className="acts"><IconBtn n="edit" s={15} title="Editar" onClick={() => setModal({ prop: p })} /><IconBtn n="x" title="Excluir" danger onClick={() => remove(p)} disabled={busy === `d-${p.id}`} /></div></td>
                    </tr>
                  ))}
                  {data!.detected.map((d) => (
                    <tr key={d.key}>
                      <td className="fx"><span className="nm" style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-2)' }}>{`{{ custom.${d.key} }}`}</span><span className="mt">Detectada em importações — sem definição</span></td>
                      <td><Pill>Detectada</Pill></td>
                      <td className="hm" style={{ color: 'var(--text-3)' }}>{d.sample}+ contatos</td>
                      <td className="r"><button type="button" className="btn btn-sm" onClick={() => setModal({ key: d.key })}>Definir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </>
        )}
      </Card>
      {modal && <PropModal prop={modal.prop} presetKey={modal.key} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(true) }} />}
    </>
  )
}

function PropModal({ prop, presetKey, onClose, onDone }: { prop?: Prop; presetKey?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [label, setLabel] = useState(prop?.label || (presetKey ? presetKey.replace(/_/g, ' ') : ''))
  const [type, setType] = useState(prop?.type || 'text')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const key = prop?.key || presetKey || label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      if (prop) await api('/api/settings/variables', { method: 'PATCH', json: { id: prop.id, label: label.trim(), type } })
      else await api('/api/settings/variables', { method: 'POST', json: { label: label.trim(), type, key: presetKey } })
      toast.success(prop ? 'Propriedade atualizada' : 'Propriedade criada'); onDone()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={prop ? 'Editar propriedade' : 'Nova propriedade'} desc={<>Disponível como <code style={{ fontFamily: 'var(--mono)' }}>{`{{ custom.${key || 'nome'} }}`}</code> em e-mails, WhatsApp e segmentos.</>} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={label.trim().length < 2 || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}{prop ? 'Salvar' : 'Criar'}</button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Nome" error={err}><input className={'in' + (err ? ' err' : '')} autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tipo de cabelo" /></Field>
        <Field label="Tipo"><select className="in" value={type} onChange={(e) => setType(e.target.value)}>{PROP_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
    </Modal>
  )
}

function EventFieldsCard() {
  const [trigger, setTrigger] = useState('trigger_order')
  const [filter, setFilter] = useState('')
  const [c, cp] = useCopy()
  const { data, loading } = useApi<{ paths: Array<{ path: string; sample: any; type: string }>; event_count_sampled: number }>(`/api/automations/variables/discover?triggerType=${trigger}`, [trigger])
  const paths = (data?.paths || []).filter((p) => !filter || p.path.toLowerCase().includes(filter.toLowerCase())).slice(0, 60)
  return (
    <Card title="Campos do evento" desc="Detectados nos eventos reais da sua loja — use em automações como {{ trigger.caminho }}." right={<div style={{ display: 'flex', gap: 8 }}><select className="in" style={{ height: 34, width: 200 }} value={trigger} onChange={(e) => setTrigger(e.target.value)} aria-label="Gatilho">{TRIGGERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><input className="in" style={{ height: 34, width: 180 }} placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar campos" /></div>} flush>
      {loading && !data ? <div className="sc-b"><div className="sk w60" /><div className="sk w80" /></div> : paths.length === 0 ? <div className="empty2"><b>Nenhum campo detectado</b>Quando a loja receber eventos deste tipo, os campos aparecem aqui.</div> : (
        <>
          <div className="tw"><table className="stbl">
            <thead><tr><th>Variável</th><th>Tipo</th><th className="hm">Exemplo</th><th></th></tr></thead>
            <tbody>
              {paths.map((p) => (
                <tr key={p.path}><td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--acc-ink)' }}>{`{{ ${p.path} }}`}</td><td><Pill>{p.type}</Pill></td><td className="hm" style={{ color: 'var(--text-2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(p.sample ?? '')}</td><td className="r"><button type="button" className={'cpb' + (c === p.path ? ' ok' : '')} style={{ height: 30 }} onClick={() => cp(p.path, `{{ ${p.path} }}`)}>{c === p.path ? 'Copiado' : 'Copiar'}</button></td></tr>
              ))}
            </tbody>
          </table></div>
          <div className="sc-f"><span className="hint">Detectadas nos últimos {data?.event_count_sampled || 0} eventos · {data?.paths.length || 0} campos no total</span></div>
        </>
      )}
    </Card>
  )
}

function ShortcutsCard() {
  const { data, loading, reload } = useApi<{ variables: CustomVar[] }>('/api/automations/variables/custom')
  const confirm = useConfirm()
  const toast = useToast()
  const { busy, run } = useAction()
  const [modal, setModal] = useState<{ v?: CustomVar } | null>(null)
  const remove = async (v: CustomVar) => {
    if (!(await confirm.confirm({ title: `Excluir o atalho “${v.variable_key}”?`, confirmLabel: 'Excluir', destructive: true }))) return
    await run(`d-${v.id}`, async () => { await api('/api/automations/variables/custom', { method: 'DELETE', json: { id: v.id } }); await reload(true) }, { success: 'Atalho excluído' })
  }
  return (
    <>
      <Card title="Atalhos personalizados" desc="Nomes amigáveis para campos longos do evento. Use como {{ custom.nome }}." right={<button type="button" className="btn btn-sm" onClick={() => setModal({})}><I n="plus" s={14} />Novo atalho</button>} flush>
        {loading && !data ? <div className="sc-b"><div className="sk w60" /></div> : !data?.variables.length ? <div className="empty2"><b>Nenhum atalho</b>Ex.: {`{{ custom.primeiro_nome }}`} → trigger.customer.first_name com padrão “cliente”.</div> : (
          <div className="tw"><table className="stbl"><tbody>
            {data.variables.map((v) => (
              <tr key={v.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--acc-ink)', whiteSpace: 'nowrap' }}>{`{{ custom.${v.variable_key} }}`}</td>
                <td className="fx" style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-3)' }}><span className="nm" style={{ fontWeight: 400 }}>{v.path}{v.default_value ? ` | default: "${v.default_value}"` : ''}</span>{v.label && <span className="mt">{v.label}</span>}</td>
                <td className="r"><div className="acts"><IconBtn n="edit" s={15} title="Editar" onClick={() => setModal({ v })} /><IconBtn n="x" title="Excluir" danger onClick={() => remove(v)} disabled={busy === `d-${v.id}`} /></div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Card>
      {modal && <ShortcutModal v={modal.v} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success(modal.v ? 'Atalho atualizado' : 'Atalho criado'); reload(true) }} />}
    </>
  )
}

function ShortcutModal({ v, onClose, onDone }: { v?: CustomVar; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ label: v?.label || '', variable_key: v?.variable_key || '', path: v?.path || '', fallback_path: v?.fallback_path || '', default_value: v?.default_value || '', variable_type: v?.variable_type || 'string' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form, val: string) => setForm((o) => ({ ...o, [k]: k === 'variable_key' ? val.toLowerCase().replace(/[^a-z0-9_]/g, '_') : val }))
  const ok = form.label.trim() && form.path.trim()
  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      if (v) await api('/api/automations/variables/custom', { method: 'PATCH', json: { id: v.id, ...form } })
      else await api('/api/automations/variables/custom', { method: 'POST', json: form })
      onDone()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={v ? 'Editar atalho' : 'Novo atalho'} desc="Aponte um nome curto para um caminho do evento. Funciona em todas as automações." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}{v ? 'Salvar' : 'Criar'}</button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="in2">
          <Field label="Nome" error={err}><input className="in" autoFocus value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Primeiro nome" /></Field>
          <Field label="Chave"><input className="in mono" value={form.variable_key} onChange={(e) => set('variable_key', e.target.value)} placeholder="primeiro_nome" /></Field>
        </div>
        <Field label="Caminho no evento"><input className="in mono" value={form.path} onChange={(e) => set('path', e.target.value)} placeholder="trigger.customer.first_name" /></Field>
        <div className="in2">
          <Field label="Caminho alternativo (opcional)"><input className="in mono" value={form.fallback_path} onChange={(e) => set('fallback_path', e.target.value)} placeholder="trigger.billing_address.first_name" /></Field>
          <Field label="Valor padrão (opcional)"><input className="in" value={form.default_value} onChange={(e) => set('default_value', e.target.value)} placeholder="cliente" /></Field>
        </div>
        <Field label="Tipo"><select className="in" value={form.variable_type} onChange={(e) => set('variable_type', e.target.value)}>{['string', 'number', 'currency', 'date', 'datetime', 'boolean', 'array', 'object'].map((t) => <option key={t}>{t}</option>)}</select></Field>
      </div>
    </Modal>
  )
}

'use client'

// Configurações → Atribuição (desenho PAtrib): janela por canal, modelo e sinais.

import { useEffect } from 'react'
import { Card, Row, SaveBar, Title, LoadingCard, Tog, RadioCard, useForm } from '@/components/settings/ui'
import { api } from '@/components/settings/format'
import { useApi, useSave } from '@/components/settings/hooks'

interface Attr { email_window_days: number; whatsapp_window_days: number; sms_window_days: number; count_opens: boolean; exclude_mpp_opens: boolean; model: 'last_touch' | 'first_touch' }
const WINDOWS = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 60, 90]
const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`

export default function AttributionSettingsPage() {
  const { data, loading, error, reload } = useApi<Attr>('/api/settings/attribution')
  return (
    <>
      <Title h="Atribuição" p="Como o Worder decide que uma venda veio de uma campanha ou automação." />
      {loading && !data ? <><LoadingCard rows={3} /><LoadingCard rows={2} /><LoadingCard rows={2} /></> : error || !data ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : <Form data={data} onSaved={() => reload(true)} />}
    </>
  )
}

function Form({ data, onSaved }: { data: Attr; onSaved: () => void }) {
  const f = useForm<Attr>({ ...data })
  useEffect(() => { f.reset({ ...data }) }, [JSON.stringify(data)]) // eslint-disable-line react-hooks/exhaustive-deps
  const w = useSave(); const m = useSave(); const s = useSave()
  const v = f.val!
  const persist = async () => { await api('/api/settings/attribution', { method: 'POST', json: f.val }); onSaved() }
  const dirtyW = v.email_window_days !== data.email_window_days || v.whatsapp_window_days !== data.whatsapp_window_days || v.sms_window_days !== data.sms_window_days
  const dirtyM = v.model !== data.model
  const dirtyS = v.count_opens !== data.count_opens || v.exclude_mpp_opens !== data.exclude_mpp_opens
  const cancel = (keys: (keyof Attr)[]) => () => { const p: any = {}; for (const k of keys) p[k] = data[k]; f.patch(p) }
  const sel = (k: 'email_window_days' | 'whatsapp_window_days' | 'sms_window_days', opts: number[]) => (
    <select className="in" style={{ maxWidth: 200 }} value={v[k]} onChange={(e) => f.set(k, Number(e.target.value))} aria-label={k}>
      {!opts.includes(v[k]) && <option value={v[k]}>{dias(v[k])}</option>}
      {opts.map((d) => <option key={d} value={d}>{dias(d)}</option>)}
    </select>
  )
  return (
    <>
      <Card title="Janela de atribuição" desc="Por quantos dias uma compra pode ser creditada após a interação." foot={<SaveBar dirty={dirtyW} saving={w.saving} error={w.error} onSave={() => w.save(persist, 'Janela salva')} onCancel={cancel(['email_window_days', 'whatsapp_window_days', 'sms_window_days'])} />}>
        <Row label="E-mail" help="Padrão do mercado: 5 dias.">{sel('email_window_days', WINDOWS)}</Row>
        <Row label="WhatsApp" help="Conversas convertem rápido.">{sel('whatsapp_window_days', [1, 2, 3, 5, 7, 14])}</Row>
        <Row label="SMS">{sel('sms_window_days', [1, 2, 3, 5, 7])}</Row>
      </Card>
      <Card title="Modelo" foot={<SaveBar dirty={dirtyM} saving={m.saving} error={m.error} onSave={() => m.save(persist, 'Modelo salvo')} onCancel={cancel(['model'])} />}>
        <div style={{ display: 'grid', gap: 10, padding: '14px 0 18px' }} role="radiogroup">
          <RadioCard on={v.model === 'last_touch'} onClick={() => f.set('model', 'last_touch')} title="Último toque" desc="Credita a venda à última mensagem clicada ou aberta antes da compra. Padrão do mercado." />
          <RadioCard on={v.model === 'first_touch'} onClick={() => f.set('model', 'first_touch')} title="Primeiro toque" desc="Credita à primeira mensagem dentro da janela. Útil para medir o que trouxe o cliente de volta." />
        </div>
      </Card>
      <Card title="Sinais considerados" foot={<SaveBar dirty={dirtyS} saving={s.saving} error={s.error} onSave={() => s.save(persist, 'Sinais salvos')} onCancel={cancel(['count_opens', 'exclude_mpp_opens'])} />}>
        <Row tg label="Contar aberturas" help="Desligado: só cliques contam. Recomendado para B2B ou e-mails transacionais."><Tog on={v.count_opens} set={(x) => f.set('count_opens', x)} label="Contar aberturas" /></Row>
        <Row tg label="Ignorar aberturas do Apple Mail Privacy" help="Aberturas automáticas do iOS não contam como engajamento real."><Tog on={v.exclude_mpp_opens} set={(x) => f.set('exclude_mpp_opens', x)} disabled={!v.count_opens} label="Ignorar aberturas do Apple Mail Privacy" /></Row>
      </Card>
    </>
  )
}

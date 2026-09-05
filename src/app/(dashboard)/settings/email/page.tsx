'use client'

// Configurações → Domínios e remetente (desenho PDom v3): remetente padrão da
// loja, domínios de envio (cards com DKIM/SPF/DMARC/links), assistente de
// verificação, domínio dos links, warm-up e eventos de entrega do Resend.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStoreStore } from '@/stores'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, SaveBar, Title, LoadingCard, Badge, Tog, Modal, IconBtn, useForm, Empty } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, fmtDateBR } from '@/components/settings/format'
import { useApi, useSave, useAction } from '@/components/settings/hooks'
import { AddDomainModal, DomainWizard, recordsFor, type DomainRow } from '@/components/settings/DomainWizard'

interface EmailSettings { default_sender_name?: string; default_sender_email?: string; default_reply_to?: string; tracking_domain?: string | null }
interface StoreEmail { email_settings: EmailSettings; shared_domain: string; is_shared_domain: boolean; suggested_local_part: string; allocated?: boolean }
interface DmarcInfo { ok: boolean; state: string }

export default function DomainsSettingsPage() {
  const { currentStore, _hasHydrated } = useStoreStore() as any
  const storeId: string | null = currentStore?.id || null
  const storeName: string = currentStore?.name || currentStore?.shop_name || 'sua loja'
  const toast = useToast()
  const confirm = useConfirm()
  const { busy, run } = useAction()

  const dom = useApi<{ domains: DomainRow[] }>(_hasHydrated ? `/api/email/domains${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}` : null, [storeId])
  const se = useApi<StoreEmail>(_hasHydrated && storeId ? `/api/settings/store-email?storeId=${encodeURIComponent(storeId)}` : null, [storeId])
  const domains = dom.data?.domains || []
  const sharedDomain = se.data?.shared_domain || 'worder.email'

  // DMARC por domínio (consulta DNS ao vivo; cacheada aqui).
  const [dmarc, setDmarc] = useState<Record<string, DmarcInfo | null>>({})
  useEffect(() => {
    for (const d of domains) {
      if (dmarc[d.domain] !== undefined) continue
      setDmarc((o) => ({ ...o, [d.domain]: null }))
      api<{ checks: { dmarc: DmarcInfo } }>(`/api/deliverability/domain-check?domain=${encodeURIComponent(d.domain)}`)
        .then((r) => setDmarc((o) => ({ ...o, [d.domain]: r.checks?.dmarc || { ok: false, state: 'missing' } })))
        .catch(() => setDmarc((o) => ({ ...o, [d.domain]: { ok: false, state: 'missing' } })))
    }
  }, [domains]) // eslint-disable-line react-hooks/exhaustive-deps

  const [addOpen, setAddOpen] = useState(false)
  const [addErr, setAddErr] = useState<string | null>(null)
  const [wiz, setWiz] = useState<{ d: DomainRow; step: 1 | 2 | 3 } | null>(null)
  const senderRef = useRef<{ setDomain: (d: string) => void; setTracking: (v: string) => void } | null>(null)

  const addDomain = async (domain: string) => {
    if (domains.some((x) => x.domain === domain)) { const ex = domains.find((x) => x.domain === domain)!; setAddOpen(false); setWiz({ d: ex, step: ex.status === 'verified' ? 3 : 2 }); return }
    setAddErr(null)
    const r = await run('add', async () => api<{ domain: DomainRow }>('/api/email/domains', { method: 'POST', json: { domain, storeId } }), { error: 'Não foi possível adicionar o domínio' })
    if (!r?.domain) { setAddErr('Não foi possível adicionar. Confira o domínio e tente de novo.'); return }
    setAddOpen(false)
    await dom.reload(true)
    setWiz({ d: r.domain, step: 1 })
  }

  const removeDomain = async (d: DomainRow) => {
    if (!(await confirm.confirm({ title: `Remover ${d.domain}?`, description: 'Remetentes neste domínio voltam para o domínio compartilhado do Worder. Os registros DNS podem ficar no seu provedor.', confirmLabel: 'Remover', destructive: true }))) return
    await run(`rm-${d.id}`, async () => { await api(`/api/email/domains/${d.id}`, { method: 'DELETE' }); await dom.reload(true); se.reload(true) }, { success: 'Domínio removido' })
  }

  const verifyQuick = (d: DomainRow) => setWiz({ d, step: 3 })

  const onWizardDone = async () => {
    const d = wiz?.d
    setWiz(null)
    await dom.reload(true)
    if (d) senderRef.current?.setDomain(d.domain)
  }
  const wizardAction = async (d: DomainRow, action: 'warmup' | 'links' | 'dmarc') => {
    if (action === 'warmup') { await api('/api/email/domains/warmup', { method: 'POST', json: { domain_id: d.id, enabled: true } }); await dom.reload(true); toast.success('Warm-up ativado', 'Dia 1 de 14 · limite de 200 e-mails hoje.') }
    if (action === 'links') { senderRef.current?.setTracking(`links.${d.domain}`); toast.info('Domínio dos links preenchido', 'Salve em “Domínio dos links” e crie o CNAME.') }
    if (action === 'dmarc') { try { await navigator.clipboard.writeText('v=DMARC1; p=quarantine; rua=mailto:dmarc@worder.email') } catch { /* sem clipboard */ } toast.info('Registro copiado', `Publique em _dmarc.${d.domain} quando os envios estiverem estáveis.`) }
  }

  const ownDomain = domains.find((d) => !d.is_system)
  const senderDomain = se.data?.email_settings?.default_sender_email?.split('@')[1] || sharedDomain
  const trackingDomain = se.data?.email_settings?.tracking_domain || ''

  if (!_hasHydrated || (dom.loading && !dom.data)) return <><Title h="Domínios e remetente" p="De quem os e-mails saem e como o seu domínio é autenticado." /><LoadingCard rows={3} /><LoadingCard rows={2} /></>

  return (
    <>
      <Title h="Domínios e remetente" p="De quem os e-mails saem e como o seu domínio é autenticado." right={<button type="button" className="btn btn-primary" onClick={() => { setAddErr(null); setAddOpen(true) }}><I n="plus" s={15} />Adicionar domínio</button>} />

      {!storeId ? (
        <Card><Empty title="Selecione uma loja">O remetente e os domínios de envio são configurados por loja. Escolha uma loja no menu lateral.</Empty></Card>
      ) : se.error ? (
        <Card><div className="empty2"><b>Não foi possível carregar o remetente</b>{se.error}<div><button className="btn" onClick={() => se.reload()}>Tentar de novo</button></div></div></Card>
      ) : se.data ? (
        <SenderCard key={storeId} storeId={storeId} storeName={storeName} data={se.data} domains={domains} refInit={(r) => { senderRef.current = r }} onSaved={() => se.reload(true)} />
      ) : <LoadingCard rows={3} />}

      <div className="st-title" style={{ marginTop: 8 }}><div><h2 style={{ fontSize: 16 }}>Domínios de envio</h2></div></div>
      {dom.error && <Card><div className="empty2"><b>Não foi possível carregar os domínios</b>{dom.error}<div><button className="btn" onClick={() => dom.reload()}>Tentar de novo</button></div></div></Card>}
      {domains.map((x) => {
        const ok = x.status === 'verified'
        const recs = recordsFor(x)
        const dk = ok ? 1 : recs.some((r) => r.id === 'dkim' && r.status === 'verified') ? 1 : 0
        const sp = ok ? 1 : recs.some((r) => r.id.startsWith('spf') && r.status === 'verified') ? 1 : 0
        const dm = dmarc[x.domain]
        const dmv = dm === null || dm === undefined ? 3 : dm.ok ? 1 : dm.state === 'warn' ? 2 : 0
        const linksOk = !!trackingDomain && trackingDomain.endsWith(x.domain)
        const missing = recs.filter((r) => r.required && r.status !== 'verified').length
        const isDefault = senderDomain === x.domain
        return (
          <div key={x.id} className="dcard">
            <div className="dcard-h">
              <I n="mail" s={20} c={ok ? 'var(--pos)' : 'var(--text-3)'} />
              <div><div className="dn">{x.domain}</div><div className="dm">{x.is_system ? 'Domínio compartilhado do Worder · pronto para uso' : ok ? `Verificado em ${fmtDateBR(x.verified_at || x.created_at)}` : `Adicionado em ${fmtDateBR(x.created_at)} · aguardando DNS`}</div></div>
              <div className="acts">
                {ok ? <Badge k="ok">Verificado</Badge> : <Badge k="warn">Pendente</Badge>}
                {isDefault && <Badge k="acc">Padrão</Badge>}
                {!x.is_system && !ok && <button type="button" className="btn btn-sm btn-primary" onClick={() => setWiz({ d: x, step: 2 })}>Continuar verificação</button>}
                {!x.is_system && ok && <button type="button" className="btn btn-sm" onClick={() => verifyQuick(x)}><I n="refresh" s={14} />Verificar</button>}
                {!x.is_system && <IconBtn n="x" title="Remover" danger onClick={() => removeDomain(x)} disabled={busy === `rm-${x.id}`} />}
              </div>
            </div>
            <div className="auth">
              <div><Ic v={dk} /><div>DKIM<small>{dk ? 'Assinando' : 'Não encontrado'}</small></div></div>
              <div><Ic v={sp} /><div>SPF<small>{sp ? 'Autorizado' : 'Não encontrado'}</small></div></div>
              <div><Ic v={dmv === 3 ? 2 : dmv} /><div>DMARC<small>{dmv === 3 ? 'Consultando…' : dmv === 1 ? 'Publicado' : dmv === 2 ? 'p=none' : 'Recomendado'}</small></div></div>
              <div><Ic v={linksOk ? 1 : 0} /><div>Domínio dos links<small>{linksOk ? trackingDomain : 'Não configurado'}</small></div></div>
            </div>
            {!ok && <div className="warnbar"><I n="alert" s={16} />Faltam {missing} {missing === 1 ? 'registro' : 'registros'} DNS. Enquanto isso, envios usam {sharedDomain}.<button type="button" className="btn btn-sm" onClick={() => setWiz({ d: x, step: 2 })}>Ver registros</button></div>}
          </div>
        )
      })}
      {!dom.error && domains.length === 0 && <Card><Empty title="Nenhum domínio ainda" action={<button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}><I n="plus" s={15} />Adicionar domínio</button>}>Enquanto isso seus e-mails saem pelo domínio compartilhado {sharedDomain}.</Empty></Card>}

      {storeId && se.data && <LinkDomainCard key={`ld-${storeId}`} storeId={storeId} data={se.data} onSaved={() => se.reload(true)} register={(fn) => { const prev = senderRef.current; senderRef.current = { setDomain: prev?.setDomain || (() => {}), setTracking: fn } }} />}

      <Card title="Aquecimento de envio">
        <Row tg label="Warm-up automático" help={ownDomain ? (ownDomain.warmup_enabled ? `Aumenta o volume diário gradualmente para construir reputação. Dia ${ownDomain.warmup_day || 1} de 14 · limite hoje: ${(ownDomain.warmup_daily_limit || 200).toLocaleString('pt-BR')} e-mails.` : `Aumenta o volume diário gradualmente para construir reputação de ${ownDomain.domain}. Começa em 200 e-mails/dia.`) : 'Disponível depois de adicionar um domínio próprio. O domínio compartilhado já está aquecido.'}>
          <Tog on={!!ownDomain?.warmup_enabled} disabled={!ownDomain || busy === 'warm'} label="Warm-up automático" set={(v) => ownDomain && run('warm', async () => { await api('/api/email/domains/warmup', { method: 'POST', json: { domain_id: ownDomain.id, enabled: v } }); await dom.reload(true) }, { success: v ? 'Warm-up ativado' : 'Warm-up desativado' })} />
        </Row>
      </Card>

      <ResendEventsCard />

      {addOpen && <AddDomainModal onClose={() => setAddOpen(false)} onNext={addDomain} busy={busy === 'add'} error={addErr} />}
      {wiz && <DomainWizard domain={wiz.d} storeName={storeName} initialStep={wiz.step} onClose={() => { setWiz(null); dom.reload(true) }} onDone={onWizardDone} onVerified={() => dom.reload(true)} onNextStep={(a) => wizardAction(wiz.d, a)} />}
    </>
  )
}

function Ic({ v }: { v: number }) {
  return <span className={'ic ' + (v === 1 ? 'ok' : v === 2 ? 'warn' : 'no')}><I n={v === 1 ? 'check' : v === 2 ? 'clock' : 'x'} s={11} /></span>
}

// ---------- Remetente padrão ----------
function SenderCard({ storeId, storeName, data, domains, refInit, onSaved }: { storeId: string; storeName: string; data: StoreEmail; domains: DomainRow[]; refInit: (r: { setDomain: (d: string) => void; setTracking: (v: string) => void }) => void; onSaved: () => void }) {
  const toast = useToast()
  const es = data.email_settings || {}
  const [local0, domain0] = (es.default_sender_email || `${data.suggested_local_part || 'contato'}@${data.shared_domain}`).split('@')
  const f = useForm({ name: es.default_sender_name || storeName, local: local0 || 'contato', domain: domain0 || data.shared_domain, replyTo: es.default_reply_to || '' })
  const { saving, error, save, setError } = useSave()
  const [avail, setAvail] = useState<{ state: 'idle' | 'checking' | 'ok' | 'taken'; suggestion?: string }>({ state: 'idle' })
  const [pendingSync, setPendingSync] = useState<null | { senderName?: string; senderEmail?: string; replyTo?: string; previousEmail?: string }>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  useEffect(() => { refInit({ setDomain: (d) => f.set('domain', d), setTracking: () => {} }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const v = f.val!
  const verifiedDomains = useMemo(() => domains.filter((d) => d.status === 'verified'), [domains])
  const isShared = v.domain === data.shared_domain
  const email = `${v.local}@${v.domain}`
  const localOk = /^[a-z0-9][a-z0-9._-]{0,62}$/.test(v.local)

  // Disponibilidade do nome no domínio compartilhado (400 ms).
  useEffect(() => {
    if (!isShared || !localOk || v.local === local0) { setAvail({ state: 'idle' }); return }
    setAvail({ state: 'checking' })
    const t = setTimeout(async () => {
      try {
        const r = await api<{ available: boolean; suggestion?: string }>(`/api/email/shared-sender/check?local=${encodeURIComponent(v.local)}&storeId=${encodeURIComponent(storeId)}`)
        setAvail(r.available ? { state: 'ok' } : { state: 'taken', suggestion: r.suggestion })
      } catch { setAvail({ state: 'idle' }) }
    }, 400)
    return () => clearTimeout(t)
  }, [v.local, isShared, localOk, storeId, local0])

  const onSave = () => save(async () => {
    if (!localOk) throw new Error('Use só letras minúsculas, números, ponto, hífen ou sublinhado antes do @.')
    if (v.replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.replyTo)) throw new Error('E-mail de resposta inválido.')
    try {
      await api('/api/settings/store-email', { method: 'PATCH', json: { storeId, email_settings: { default_sender_name: v.name.trim(), default_sender_email: email, default_reply_to: v.replyTo.trim() || null } } })
    } catch (e: any) {
      if (e.code === 'local_part_taken' || e.data?.code === 'local_part_taken') { setAvail({ state: 'taken', suggestion: e.data?.suggestion }); throw new Error(`“${v.local}@${data.shared_domain}” já está em uso por outra loja.${e.data?.suggestion ? ` Sugestão: ${e.data.suggestion}` : ''}`) }
      throw e
    }
    const prevEmail = es.default_sender_email
    const changed = { senderName: v.name.trim() !== (es.default_sender_name || ''), senderEmail: email !== prevEmail, replyTo: (v.replyTo.trim() || '') !== (es.default_reply_to || '') }
    onSaved()
    if (changed.senderName || changed.senderEmail || changed.replyTo) {
      setPendingSync({ senderName: changed.senderName ? v.name.trim() : undefined, senderEmail: changed.senderEmail ? email : undefined, replyTo: changed.replyTo ? v.replyTo.trim() : undefined, previousEmail: prevEmail })
    }
  }, 'Remetente salvo')

  const applySync = async (scope: 'all' | 'empty') => {
    if (!pendingSync) return
    setSyncing(true)
    try {
      const r = await api<{ nodesUpdated: number; automationsUpdated: number }>('/api/email/sync-defaults', { method: 'POST', json: { ...pendingSync, storeId, onlyEmpty: scope === 'empty' } })
      setSyncResult(r)
    } catch (e: any) { toast.error('Não foi possível atualizar as automações', e.message) } finally { setSyncing(false) }
  }

  return (
    <>
      <Card title="Remetente padrão" desc={`Usado em novas campanhas e automações da ${storeName}.`} foot={<SaveBar dirty={f.dirty} saving={saving} error={error} hint={`Envios de: ${v.name || storeName} <${email}>`} onSave={onSave} onCancel={() => { f.cancel(); setError(null) }} disabled={avail.state === 'taken' || avail.state === 'checking'} />}>
        <Row label="Nome do remetente" htmlFor="sd-name"><input id="sd-name" className="in" value={v.name} onChange={(e) => f.set('name', e.target.value)} /></Row>
        <Row label="E-mail do remetente" help="Só domínios verificados aparecem aqui.">
          <div className="in2">
            <input className={'in' + (avail.state === 'taken' || !localOk ? ' err' : '')} value={v.local} onChange={(e) => f.set('local', e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} aria-label="Parte antes do @" />
            <select className="in" value={v.domain} onChange={(e) => f.set('domain', e.target.value)} aria-label="Domínio do remetente">
              <option value={data.shared_domain}>@{data.shared_domain} · compartilhado</option>
              {verifiedDomains.filter((d) => d.domain !== data.shared_domain).map((d) => <option key={d.id} value={d.domain}>@{d.domain}</option>)}
              {domains.filter((d) => d.status !== 'verified' && !d.is_system).map((d) => <option key={d.id} value={d.domain} disabled>@{d.domain} · aguardando</option>)}
            </select>
          </div>
          {avail.state === 'checking' && <div className="hp" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Verificando disponibilidade…</div>}
          {avail.state === 'ok' && <div className="hp" style={{ fontSize: 12.5, color: 'var(--pos)' }}>Disponível.</div>}
          {avail.state === 'taken' && <div className="field-err">Já em uso por outra loja.{avail.suggestion && <> Sugestão: <button type="button" className="btn-link" style={{ color: 'var(--acc-ink)', fontWeight: 500 }} onClick={() => f.set('local', avail.suggestion!)}>{avail.suggestion}</button></>}</div>}
        </Row>
        <Row label="Responder para" help="Onde chegam as respostas dos clientes." htmlFor="sd-reply"><input id="sd-reply" className="in" type="email" placeholder={email} value={v.replyTo} onChange={(e) => f.set('replyTo', e.target.value)} /></Row>
      </Card>

      {pendingSync && (
        <Modal title={syncResult ? 'Atualizado' : 'Aplicar nos e-mails já existentes?'} desc={syncResult ? `${syncResult.nodesUpdated} e-mail${syncResult.nodesUpdated === 1 ? '' : 's'} em ${syncResult.automationsUpdated} automaç${syncResult.automationsUpdated === 1 ? 'ão' : 'ões'} desta loja passaram a usar o novo remetente.` : 'As automações desta loja podem ter e-mails com o remetente antigo. Quer atualizar?'} onClose={() => { if (!syncing) { setPendingSync(null); setSyncResult(null) } }}
          footer={syncResult ? <button type="button" className="btn btn-primary" onClick={() => { setPendingSync(null); setSyncResult(null) }}>Fechar</button> : <><button type="button" className="btn" disabled={syncing} onClick={() => setPendingSync(null)}>Não atualizar</button><button type="button" className="btn" disabled={syncing} onClick={() => applySync('empty')}>Apenas onde está vazio</button><button type="button" className="btn btn-primary" disabled={syncing} onClick={() => applySync('all')}>{syncing && <I n="refresh" s={14} className="spin" />}Atualizar em todos</button></>}>
          {!syncResult && (
            <div className="kv">
              {pendingSync.senderName && <><span>Nome</span><b>{pendingSync.senderName}</b></>}
              {pendingSync.senderEmail && <><span>E-mail</span><b>{pendingSync.senderEmail}</b></>}
              {pendingSync.replyTo !== undefined && <><span>Responder para</span><b>{pendingSync.replyTo || '—'}</b></>}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// ---------- Domínio dos links ----------
function LinkDomainCard({ storeId, data, onSaved, register }: { storeId: string; data: StoreEmail; onSaved: () => void; register: (fn: (v: string) => void) => void }) {
  const f = useForm({ tracking: data.email_settings?.tracking_domain || '' })
  useEffect(() => { register((v) => f.set('tracking', v)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const [host, setHost] = useState('app.worder.com.br')
  useEffect(() => { try { setHost(window.location.host) } catch { /* ssr */ } }, [])
  const clean = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-z0-9.-]/g, '')
  const onSave = () => save(async () => {
    const t = clean(f.val!.tracking)
    if (t && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(t)) throw new Error('Subdomínio inválido. Ex.: links.sualoja.com.br')
    await api('/api/settings/store-email', { method: 'PATCH', json: { storeId, email_settings: { tracking_domain: t || null } } })
    onSaved()
  }, 'Domínio dos links salvo')
  const t = clean(f.val!.tracking)
  return (
    <Card title="Domínio dos links" desc={`Cliques, aberturas e descadastro passam pelo seu domínio em vez de ${data.shared_domain}.`} foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
      <Row label="Subdomínio" help={<>Crie um <b>CNAME</b> de {t || 'links.sualoja.com.br'} apontando para <b>{host}</b>.</>} htmlFor="ld-in">
        <input id="ld-in" className="in mono" placeholder="links.drgroot.com.br" value={f.val!.tracking} onChange={(e) => f.set('tracking', e.target.value)} />
      </Row>
    </Card>
  )
}

// ---------- Eventos de entrega (webhook do Resend) ----------
function ResendEventsCard() {
  const [status, setStatus] = useState<'checking' | 'idle' | 'loading' | 'done' | 'error'>('checking')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    api<{ webhooks: any }>('/api/email/webhooks/register').then((d) => {
      if (cancelled) return
      const list: any[] = d?.webhooks?.data || d?.webhooks || []
      const found = Array.isArray(list) && list.some((w) => String(w.endpoint || w.url || '').includes('/api/webhooks/resend'))
      setStatus(found ? 'done' : 'idle')
      if (found) setMessage('Entregas, aberturas, cliques e rejeições chegam do Resend em tempo real.')
    }).catch(() => { if (!cancelled) setStatus('idle') })
    return () => { cancelled = true }
  }, [])
  const register = async () => {
    setStatus('loading')
    try { const d = await api<{ message?: string }>('/api/email/webhooks/register', { method: 'POST' }); setStatus('done'); setMessage(d.message || 'Webhook registrado com sucesso.') }
    catch (e: any) { setStatus('error'); setMessage(e.message || 'Erro') }
  }
  return (
    <Card title="Eventos de entrega" desc="Conexão com o Resend para receber entregas, aberturas, cliques, rejeições e reclamações.">
      <Row tg label="Webhook do Resend" help={status === 'done' ? message : status === 'error' ? message : 'Sem o webhook, as métricas de entregabilidade ficam incompletas.'}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {status === 'checking' ? <Badge k="off">Verificando…</Badge> : status === 'done' ? <Badge k="ok">Ativo</Badge> : status === 'error' ? <Badge k="err">Erro</Badge> : <Badge k="warn">Não registrado</Badge>}
          {status !== 'done' && status !== 'checking' && <button type="button" className="btn btn-sm" onClick={register} disabled={status === 'loading'}>{status === 'loading' && <I n="refresh" s={13} className="spin" />}Registrar</button>}
        </div>
      </Row>
    </Card>
  )
}

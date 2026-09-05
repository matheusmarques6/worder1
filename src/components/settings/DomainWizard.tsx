'use client'

// Domínios e remetente → "Adicionar domínio" (modal) e o assistente de
// verificação em 4 passos (Domínio → Registros DNS → Verificação → Concluído).
// Fiel ao desenho; os registros vêm do Resend (email_domains.dns_records) e a
// verificação usa /api/email/domains/verify + /api/deliverability/domain-check (DMARC).

import { useCallback, useEffect, useRef, useState } from 'react'
import { I } from './icons'
import { Badge, Modal, useCopy } from './ui'
import { api } from './format'

export interface DomainRow {
  id: string
  domain: string
  status: string
  dns_records: any[] | null
  verified_at: string | null
  created_at: string
  warmup_enabled: boolean
  warmup_day: number | null
  warmup_daily_limit: number | null
  is_system: boolean
  store_id?: string | null
}

export interface Rec { k: string; id: string; nm: string; host: string; val: string; pri?: string; required: boolean; status?: string }

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

/** Converte os registros do Resend no formato do assistente + DMARC recomendado. */
export function recordsFor(d: DomainRow): Rec[] {
  const raw: any[] = Array.isArray(d.dns_records) ? d.dns_records : []
  const out: Rec[] = []
  let spfIdx = 0
  for (const r of raw) {
    const type = String(r.type || '').toUpperCase()
    const kind = String(r.record || '').toUpperCase()
    const name = String(r.name || '')
    const host = !name || name === '@' ? d.domain : name.endsWith(d.domain) ? name : `${name}.${d.domain}`
    let id = kind.toLowerCase() || type.toLowerCase()
    let nm = kind === 'DKIM' ? 'DKIM — assinatura' : type === 'MX' ? 'MX — retorno de mensagens' : kind === 'SPF' ? 'SPF — autorização de envio' : `${type} — ${name}`
    if (kind === 'SPF') { id = type === 'MX' ? 'mx' : `spf${spfIdx++ || ''}` }
    out.push({ k: type, id, nm, host, val: String(r.value || ''), pri: r.priority != null ? String(r.priority) : undefined, required: true, status: r.status })
  }
  if (!out.length) {
    out.push({ k: 'TXT', id: 'dkim', nm: 'DKIM — assinatura', host: `resend._domainkey.${d.domain}`, val: '(gerado após adicionar o domínio)', required: true, status: 'pending' })
  }
  out.push({ k: 'TXT', id: 'dmarc', nm: 'DMARC — política (recomendado)', host: `_dmarc.${d.domain}`, val: 'v=DMARC1; p=none; rua=mailto:dmarc@worder.email', required: false })
  return out
}

export function AddDomainModal({ onClose, onNext, busy, error }: { onClose: () => void; onNext: (domain: string) => void; busy?: boolean; error?: string | null }) {
  const [v, setV] = useState('')
  const clean = v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^@/, '')
  const ok = DOMAIN_RE.test(clean) && clean !== 'worder.email'
  return (
    <Modal title="Adicionar domínio de envio" desc={<>Use o domínio da sua loja para enviar como <b>contato@suamarca.com.br</b>. Você vai precisar de acesso ao DNS.</>} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={() => onNext(clean)}>{busy ? <I n="refresh" s={14} className="spin" /> : null}Continuar<I n="arrowR" s={15} /></button></>}>
      <span className="inl">Domínio</span>
      <div className="dom-in"><span>@</span><input autoFocus placeholder="sualoja.com.br" value={v} onChange={(e) => setV(e.target.value.toLowerCase())} onKeyDown={(e) => { if (e.key === 'Enter' && ok && !busy) onNext(clean) }} aria-label="Domínio" /></div>
      {error && <div className="field-err" style={{ marginTop: 8 }}>{error}</div>}
      <div className="tip"><I n="faqHelp" s={16} /><div>Recomendamos um <b>subdomínio</b> (ex.: <code>mail.sualoja.com.br</code>) para isolar a reputação do seu site. Os e-mails ainda mostram só o domínio principal para o cliente.</div></div>
    </Modal>
  )
}

type RecState = 'ok' | 'found' | 'mismatch' | 'missing' | 'spin'
type Chk = Record<string, { state: RecState; observed?: string[] } | undefined>
interface VerifyResp { domain: DomainRow; records: Array<{ key: string; type: string; host: string; state: 'ok' | 'found' | 'missing' | 'mismatch'; dns_observed: string[] }>; dmarc: { found: boolean; value: string | null; policy: string | null }; resend_error: string | null; our_status: string }

const GUIDES: Record<string, string> = {
  Cloudflare: 'DNS → Records → Add record. Deixe o proxy (nuvem laranja) desligado para os registros TXT e MX.',
  'Registro.br': 'Painel → Editar zona → Novo registro. A propagação costuma levar até 2 h.',
  GoDaddy: 'Meus produtos → DNS → Adicionar. Use @ quando o host for igual ao domínio.',
  Hostinger: 'hPanel → Zona DNS → Gerenciar. Cole nome e valor exatamente como mostrado.',
  Outro: 'Procure por “Zona DNS” ou “Gerenciar DNS” no painel do seu provedor.',
}
const STEPS: Array<[string, string]> = [['Domínio', 'Confirmar endereço'], ['Registros DNS', 'Adicionar no provedor'], ['Verificação', 'Checamos automaticamente'], ['Concluído', 'Pronto para enviar']]

export function DomainWizard({ domain, storeName, initialStep = 1, onClose, onDone, onVerified, onNextStep }: {
  domain: DomainRow
  storeName: string
  initialStep?: 1 | 2 | 3
  onClose: () => void
  onDone: () => void
  /** Chamado quando o domínio fica verificado (para a lista atualizar). */
  onVerified?: (d: DomainRow) => void
  /** Ações do passo 4: warmup | links | dmarc */
  onNextStep?: (action: 'warmup' | 'links' | 'dmarc') => Promise<void> | void
}) {
  const [step, setStep] = useState<number>(initialStep)
  const [prov, setProv] = useState('Cloudflare')
  const [c, cp] = useCopy()
  const [d, setD] = useState<DomainRow>(domain)
  const [chk, setChk] = useState<Chk>({})
  const [checking, setChecking] = useState(false)
  const [verifyErr, setVerifyErr] = useState<string | null>(null)
  const [doneBusy, setDoneBusy] = useState<string | null>(null)
  const [doneOk, setDoneOk] = useState<Record<string, boolean>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recs = recordsFor(d)

  const verify = useCallback(async (mode: 'verify' | 'poll' = 'verify') => {
    setChecking(true)
    setVerifyErr(null)
    setChk((o) => Object.fromEntries(recs.map((r) => [r.id, o[r.id]?.state === 'ok' ? o[r.id] : { state: 'spin' as RecState }])) as Chk)
    try {
      const v = await api<VerifyResp>('/api/email/domains/verify', { method: 'POST', json: { domainId: d.id, mode } })
      const nd = v.domain || d
      setD(nd)
      const next: Chk = {}
      for (const r of recordsFor(nd)) {
        if (r.id === 'dmarc') { next[r.id] = { state: v.dmarc?.found ? 'ok' : 'missing', observed: v.dmarc?.value ? [v.dmarc.value] : [] }; continue }
        const hit = (v.records || []).find((x) => x.host.toLowerCase() === r.host.toLowerCase() && x.type.toUpperCase() === r.k.toUpperCase())
        next[r.id] = hit ? { state: nd.status === 'verified' ? 'ok' : hit.state, observed: hit.dns_observed } : { state: nd.status === 'verified' ? 'ok' : 'missing' }
      }
      setChk(next)
      if (v.resend_error) setVerifyErr(`DNS conferido, mas o Resend não respondeu (${v.resend_error}). Tentamos de novo em 30 s.`)
      if (nd.status === 'verified') onVerified?.(nd)
    } catch (e: any) {
      setVerifyErr(e.message || 'Não foi possível consultar o DNS agora.')
      setChk((o) => Object.fromEntries(recs.map((r) => [r.id, o[r.id]?.state === 'ok' ? o[r.id] : { state: 'missing' as RecState }])) as Chk)
    } finally {
      setChecking(false)
    }
  }, [d, recs, onVerified]) // eslint-disable-line react-hooks/exhaustive-deps

  // Passo 3: re-verifica a cada 30 s enquanto falta algo.
  useEffect(() => {
    if (step !== 3) return
    const allOk = d.status === 'verified' || recs.filter((r) => r.required).every((r) => chk[r.id]?.state === 'ok')
    if (allOk || checking) return
    timer.current = setTimeout(() => { verify('poll') }, 30_000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [step, chk, checking, verify, recs, d.status])

  useEffect(() => { if (initialStep === 3) verify('verify') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const allOk = d.status === 'verified' || recs.filter((r) => r.required).every((r) => chk[r.id]?.state === 'ok')
  const anyFound = recs.some((r) => r.required && chk[r.id]?.state === 'found')
  const Cp = ({ id, text }: { id: string; text: string }) => (
    <button type="button" className={'cpb' + (c === id ? ' ok' : '')} onClick={() => cp(id, text)}>{c === id ? <><I n="check" s={14} />Copiado</> : <><I n="copy" s={14} />Copiar</>}</button>
  )
  const doAction = async (k: 'warmup' | 'links' | 'dmarc') => {
    if (!onNextStep) return
    setDoneBusy(k)
    try { await onNextStep(k); setDoneOk((o) => ({ ...o, [k]: true })) } finally { setDoneBusy(null) }
  }

  return (
    <div className="wiz" role="dialog" aria-modal="true" aria-label={`Verificar domínio ${d.domain}`}>
      <div className="wiz-top">
        <img src="/worder favicon.svg" alt="" style={{ height: 20 }} />
        <span className="t">Verificar domínio</span><span className="d">{d.domain}</span>
        <button type="button" className="btn x" onClick={onClose}>Sair e continuar depois</button>
      </div>
      <div className="wiz-body">
        <aside className="wiz-steps">
          {STEPS.map((s, i) => (
            <div key={s[0]} className={'wstep' + (step === i + 1 ? ' on' : step > i + 1 ? ' done' : '')}>
              <div className="n">{step > i + 1 ? <I n="check" s={14} sw={2.4} /> : i + 1}</div>
              <div><b>{s[0]}</b><span>{s[1]}</span></div>
            </div>
          ))}
        </aside>
        <div className="wiz-main">
          {step === 1 && (
            <>
              <h2>Vamos autenticar {d.domain}</h2>
              <p>Em três passos você passa a enviar e-mails com a sua marca, com DKIM, SPF e DMARC configurados — o que Gmail e Yahoo exigem para entregar na caixa de entrada.</p>
              <div className="rec">
                <div className="rec-h"><b>O que você vai precisar</b></div>
                {[['Acesso ao painel DNS do domínio', 'Cloudflare, Registro.br, GoDaddy, Hostinger…'], ['Cerca de 10 minutos', `Copiar e colar ${recs.length} registros`], ['Paciência com a propagação', 'Até 48 h, geralmente menos de 1 h']].map(([a, b]) => (
                  <div key={a} className="rec-g" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}><I n="check" s={16} c="var(--pos)" /><div><b style={{ fontWeight: 500, fontSize: 14 }}>{a}</b><div style={{ fontSize: 13, color: 'var(--text-3)' }}>{b}</div></div></div>
                ))}
              </div>
              <div className="wiz-foot"><span></span><button type="button" className="btn btn-primary" onClick={() => setStep(2)}>Ver registros DNS<I n="arrowR" s={15} /></button></div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>Adicione estes registros no seu DNS</h2>
              <p>Copie cada valor e crie o registro no seu provedor. Não altere nada além do que está aqui.</p>
              <div className="prov">{Object.keys(GUIDES).map((p) => <button key={p} type="button" className={prov === p ? 'on' : ''} onClick={() => setProv(p)}>{p}</button>)}</div>
              <div className="tip" style={{ marginTop: 0, marginBottom: 18 }}><I n="faqHelp" s={16} /><div><b>{prov}:</b> {GUIDES[prov]}</div></div>
              {recs.map((r) => (
                <div key={r.id} className="rec">
                  <div className="rec-h"><span className="k">{r.k}</span><b>{r.nm}</b><span className="st"><Badge k={r.required ? 'warn' : 'off'}>{r.required ? 'Obrigatório' : 'Opcional'}</Badge></span></div>
                  <div className="rec-g"><label>Nome / host</label><code>{r.host}</code><Cp id={r.id + 'h'} text={r.host} /></div>
                  {r.pri && <div className="rec-g"><label>Prioridade</label><code>{r.pri}</code><Cp id={r.id + 'p'} text={r.pri} /></div>}
                  <div className="rec-g"><label>Valor</label><code>{r.val}</code><Cp id={r.id + 'v'} text={r.val} /></div>
                </div>
              ))}
              <div className="wiz-foot">
                <button type="button" className="btn" onClick={() => setStep(1)}>Voltar</button>
                <div className="grp">
                  <button type="button" className="btn" onClick={() => cp('all', recs.map((r) => `${r.k}\t${r.host}\t${r.pri ? r.pri + '\t' : ''}${r.val}`).join('\n'))}>{c === 'all' ? 'Copiado' : 'Copiar todos'}</button>
                  <button type="button" className="btn btn-primary" onClick={() => { setStep(3); verify('verify') }}>Já adicionei, verificar<I n="arrowR" s={15} /></button>
                </div>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>Verificando registros</h2>
              <p>Consultamos o DNS de {d.domain} agora. Se algo ainda não propagou, deixe aberto — checamos de novo a cada 30 segundos.</p>
              <div className="vres">
                {recs.map((r) => {
                  const st = chk[r.id]?.state
                  const obs = chk[r.id]?.observed || []
                  const ic = st === 'ok' ? 'ok' : st === 'found' ? 'ok' : st === 'missing' || st === 'mismatch' ? 'wait' : 'spin'
                  const label = st === 'ok' ? 'Verificado' : st === 'found' ? 'No DNS · confirmando no Resend' : st === 'mismatch' ? 'Valor diferente no DNS' : st === 'missing' ? 'Ainda não propagou' : 'Consultando…'
                  return (
                    <div key={r.id} className="vrow">
                      <span className={'ic ' + ic}><I n={st === 'ok' ? 'check' : st === 'found' ? 'check' : st === 'missing' || st === 'mismatch' ? 'clock' : 'refresh'} s={14} className={!st || st === 'spin' ? 'spin' : undefined} /></span>
                      <div><b>{r.nm}</b><span style={{ fontFamily: 'var(--mono)' }}>{r.host}</span>{st === 'mismatch' && obs[0] && <span style={{ fontFamily: 'var(--mono)', color: 'var(--neg)' }} title={obs.join(' | ')}>encontrado: {obs[0].slice(0, 70)}{obs[0].length > 70 ? '…' : ''}</span>}</div>
                      <span className="r" style={st === 'found' ? { color: 'var(--pos)' } : undefined}>{label}</span>
                    </div>
                  )
                })}
              </div>
              {verifyErr && <div className="field-err" style={{ marginTop: 12 }}>{verifyErr}</div>}
              {!checking && allOk && chk.dmarc && chk.dmarc.state !== 'ok' && <div className="tip"><I n="faqHelp" s={16} /><div>DMARC é opcional para começar. Você pode concluir agora — o Worder continua checando e avisa por e-mail quando o registro for encontrado.</div></div>}
              {!checking && !allOk && anyFound && <div className="tip"><I n="check" s={16} /><div>Os registros já estão no DNS público. Falta só o Resend confirmar — costuma levar poucos minutos. Pode fechar; verificamos a cada 15 min e avisamos por e-mail quando concluir.</div></div>}
              {!checking && !allOk && !anyFound && Object.keys(chk).length > 0 && <div className="tip"><I n="clock" s={16} /><div>Registros novos podem levar de alguns minutos a 48 h para propagar. Confira se copiou <b>nome</b> e <b>valor</b> exatamente — e, no Cloudflare, se o proxy está desligado. Não precisa ficar aqui: checamos a cada 15 min e avisamos por e-mail.</div></div>}
              <div className="wiz-foot">
                <button type="button" className="btn" onClick={() => setStep(2)}>Voltar aos registros</button>
                <div className="grp">
                  <button type="button" className="btn" onClick={() => verify('verify')} disabled={checking}><I n="refresh" s={14} className={checking ? 'spin' : undefined} />Verificar de novo</button>
                  <button type="button" className="btn btn-primary" disabled={!allOk} onClick={() => setStep(4)}>Concluir<I n="arrowR" s={15} /></button>
                </div>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="done-hero"><div className="ic"><I n="check" s={28} sw={2.4} /></div><h2>{d.domain} está verificado</h2><p style={{ margin: '8px auto 0', maxWidth: 460 }}>Você já pode usar remetentes @{d.domain}. Ao ir para Domínios, ele vira o padrão da {storeName} — pode mudar em Remetente padrão.</p></div>
              <div className="rec">
                <div className="rec-h"><b>Próximos passos recomendados</b></div>
                {([
                  ['warmup', 'Ativar warm-up por 14 dias', 'Protege a reputação do domínio novo aumentando o volume aos poucos.'],
                  ['links', 'Configurar o domínio dos links', `links.${d.domain} → cliques e descadastro com a sua marca.`],
                  ['dmarc', 'Publicar DMARC com p=quarantine', 'Depois de 2 semanas de envios estáveis.'],
                ] as Array<['warmup' | 'links' | 'dmarc', string, string]>).map(([k, a, b]) => (
                  <div key={k} className="rec-g" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
                    <div><b style={{ fontWeight: 500, fontSize: 14 }}>{a}</b><div style={{ fontSize: 13, color: 'var(--text-3)' }}>{b}</div></div>
                    {doneOk[k] ? <Badge k="ok">Feito</Badge> : <button type="button" className="btn btn-sm" disabled={!!doneBusy} onClick={() => doAction(k)}>{doneBusy === k && <I n="refresh" s={13} className="spin" />}Fazer</button>}
                  </div>
                ))}
              </div>
              <div className="wiz-foot"><span></span><button type="button" className="btn btn-primary" onClick={onDone}>Ir para Domínios</button></div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

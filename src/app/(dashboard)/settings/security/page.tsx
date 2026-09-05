'use client'

// Configurações → Segurança (desenho PSeg): senha, 2FA, exigir 2FA da equipe,
// sessões ativas e histórico de login.

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { Card, Row, Title, LoadingCard, Badge, Tog, Modal, Field, CopyBtn } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, describeUA, fmtDate, timeAgo } from '@/components/settings/format'
import { useApi, useAction } from '@/components/settings/hooks'
import { validatePassword } from '@/lib/password-validation'

interface Sess { id: string; user_agent: string | null; ip: string | null; city: string | null; country: string | null; created_at: string; last_seen_at: string; current: boolean }
interface Login { id: string; ip: string | null; user_agent: string | null; city: string | null; country: string | null; success: boolean; reason: string | null; created_at: string }
interface Resp {
  password_changed_at: string | null
  mfa: { enabled: boolean; factors: Array<{ id: string; type: string; name: string | null; created_at: string }>; aal: string | null }
  require_2fa: boolean
  can_manage_org: boolean
  sessions: Sess[]
  logins: Login[]
}

function since(v: string | null): string {
  if (!v) return 'Nunca alterada por aqui.'
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86400_000)
  if (days < 1) return 'Alterada hoje.'
  if (days < 30) return `Alterada há ${days} dia${days === 1 ? '' : 's'}.`
  const months = Math.floor(days / 30)
  if (months < 12) return `Alterada pela última vez há ${months} ${months === 1 ? 'mês' : 'meses'}.`
  return `Alterada pela última vez em ${fmtDate(v)}.`
}

const where = (city: string | null, country: string | null, ip: string | null) => [city, country].filter(Boolean).join(', ') || ip || 'Local desconhecido'

export default function SecuritySettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/security')
  const params = useSearchParams()
  const forced = params?.get('require2fa') === '1'
  const toast = useToast()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [pwModal, setPwModal] = useState(false)
  const [enroll, setEnroll] = useState(false)
  const [disable, setDisable] = useState<string | null>(null)

  const toggleRequire = async (v: boolean) => {
    if (v && !(await confirm.confirm({ title: 'Exigir 2FA de toda a equipe?', description: 'Membros sem verificação em duas etapas serão levados à tela de Segurança até configurar. Você já precisa ter a sua ativa.', confirmLabel: 'Exigir 2FA' }))) return
    await run('req', async () => { await api('/api/settings/security', { method: 'POST', json: { action: 'require-2fa', enabled: v } }); await reload(true) }, { success: v ? 'A equipe agora precisa de 2FA' : 'Exigência de 2FA desligada' })
  }
  const revoke = async (s: Sess) => {
    if (!(await confirm.confirm({ title: 'Encerrar esta sessão?', description: `${describeUA(s.user_agent)} · ${where(s.city, s.country, s.ip)}. O aparelho terá que entrar de novo.`, confirmLabel: 'Encerrar', destructive: true }))) return
    await run(`rv-${s.id}`, async () => { await api('/api/settings/security', { method: 'POST', json: { action: 'revoke-session', id: s.id } }); await reload(true) }, { success: 'Sessão encerrada' })
  }
  const revokeAll = async () => {
    if (!(await confirm.confirm({ title: 'Encerrar todas as outras sessões?', description: 'Todos os outros aparelhos saem da conta. Esta sessão continua.', confirmLabel: 'Encerrar todas', destructive: true }))) return
    await run('rv-all', async () => { const r = await api<{ count: number }>('/api/settings/security', { method: 'POST', json: { action: 'revoke-others' } }); await reload(true); toast.success(r.count ? `${r.count} ${r.count === 1 ? 'sessão encerrada' : 'sessões encerradas'}` : 'Nenhuma outra sessão aberta') })
  }

  const others = (data?.sessions || []).filter((s) => !s.current)

  return (
    <>
      <Title h="Segurança" p="Senha, verificação em duas etapas e sessões ativas." />
      {(forced || (data?.require_2fa && !data.mfa.enabled)) && (
        <div className="sc" style={{ padding: '14px 24px', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--warnbar-bg)', color: 'var(--warnbar-fg)', fontSize: 14 }}>
          <I n="alert" s={16} /><span>Sua organização exige verificação em duas etapas. Ative abaixo para voltar a usar o Worder.</span>
        </div>
      )}
      {loading && !data ? <><LoadingCard rows={3} /><LoadingCard rows={3} /><LoadingCard rows={3} /></> : error ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : data ? (
        <>
          <Card title="Acesso">
            <Row label="Senha" help={since(data.password_changed_at)}><div><button type="button" className="btn" onClick={() => setPwModal(true)}>Alterar senha</button></div></Row>
            <Row tg label="Verificação em duas etapas" help="Código do app autenticador a cada novo login.">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {data.mfa.enabled && <Badge k="ok">Ativa</Badge>}
                <Tog on={data.mfa.enabled} label="Verificação em duas etapas" set={(v) => { if (v) setEnroll(true); else setDisable(data.mfa.factors[0]?.id || null) }} />
              </div>
            </Row>
            <Row tg label="Exigir 2FA para toda a equipe" help="Membros sem 2FA perdem acesso até configurar.">
              <Tog on={data.require_2fa} label="Exigir 2FA para toda a equipe" disabled={!data.can_manage_org || busy === 'req'} set={toggleRequire} />
            </Row>
          </Card>

          <Card title="Sessões ativas" right={<button type="button" className="btn btn-sm" onClick={revokeAll} disabled={others.length === 0 || busy === 'rv-all'}>Encerrar todas</button>} flush>
            <div className="tw"><table className="stbl"><tbody>
              {data.sessions.map((s) => (
                <tr key={s.id}>
                  <td><span className="nm">{describeUA(s.user_agent)}{s.current ? <Badge k="acc" style={{ marginLeft: 8 }}>Esta sessão</Badge> : null}</span><span className="mt">{where(s.city, s.country, s.ip)} · {s.current ? 'Agora' : timeAgo(s.last_seen_at)}</span></td>
                  <td className="r">{!s.current && <button type="button" className="btn btn-sm" onClick={() => revoke(s)} disabled={busy === `rv-${s.id}`}>Encerrar</button>}</td>
                </tr>
              ))}
              {data.sessions.length === 0 && <tr><td><div className="empty2"><b>Nenhuma sessão registrada</b>Entre de novo para que esta sessão apareça aqui.</div></td></tr>}
            </tbody></table></div>
          </Card>

          <Card title="Histórico de login" desc="Últimos 30 dias." flush>
            {data.logins.length === 0 ? (
              <div className="empty2"><b>Nenhum login registrado ainda</b>A partir de agora cada entrada na conta aparece aqui.</div>
            ) : (
              <div className="tw"><table className="stbl">
                <thead><tr><th>Data</th><th>Dispositivo</th><th>IP</th><th>Resultado</th></tr></thead>
                <tbody>
                  {data.logins.map((l) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.created_at, true)}</td>
                      <td><span className="nm" style={{ fontWeight: 400 }}>{describeUA(l.user_agent)}</span>{(l.city || l.country) && <span className="mt">{where(l.city, l.country, null)}</span>}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{l.ip || '—'}</td>
                      <td>{l.success ? <Badge k="ok">Sucesso</Badge> : <Badge k="err">Bloqueado</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>
        </>
      ) : null}

      {pwModal && <PasswordModal onClose={() => setPwModal(false)} onDone={() => { setPwModal(false); toast.success('Senha alterada', 'Os outros aparelhos precisarão entrar de novo.'); reload(true) }} />}
      {enroll && <EnrollModal onClose={() => setEnroll(false)} onDone={() => { setEnroll(false); toast.success('Verificação em duas etapas ativa'); reload(true); if (forced) window.location.href = '/dashboard' }} />}
      {disable && <DisableModal factorId={disable} onClose={() => setDisable(null)} onDone={() => { setDisable(null); toast.warning('Verificação em duas etapas desativada'); reload(true) }} />}
    </>
  )
}

function PasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [rep, setRep] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const v = validatePassword(nw)
  const ok = cur.length > 0 && v.isValid && nw === rep
  const submit = async () => {
    setBusy(true); setErr(null)
    try { await api('/api/settings/security', { method: 'POST', json: { action: 'change-password', current_password: cur, new_password: nw } }); onDone() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Alterar senha" desc="Use pelo menos 8 caracteres com letras maiúsculas, minúsculas, número e símbolo." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Salvar nova senha</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok && !busy) submit() }} style={{ display: 'grid', gap: 14 }}>
        <Field label="Senha atual" error={err}><input className={'in' + (err ? ' err' : '')} type={show ? 'text' : 'password'} autoFocus value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Nova senha"><input className="in" type={show ? 'text' : 'password'} value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Repita a nova senha" error={rep && nw !== rep ? 'As senhas não coincidem.' : null}><input className={'in' + (rep && nw !== rep ? ' err' : '')} type={show ? 'text' : 'password'} value={rep} onChange={(e) => setRep(e.target.value)} autoComplete="new-password" /></Field>
        {nw && !v.isValid && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-3)' }}>{v.errors.map((m) => <li key={m}>{m}</li>)}</ul>}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-2)' }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Mostrar senhas</label>
      </form>
    </Modal>
  )
}

function EnrollModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data, loading, error } = useApi<{ factor_id: string; qr_code: string; secret: string; uri: string }>(null)
  const [enr, setEnr] = useState<{ factor_id: string; qr_code: string; secret: string; uri: string } | null>(null)
  const [enrErr, setEnrErr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  void data; void loading; void error
  // Inicia o cadastro ao abrir.
  if (!enr && !enrErr && !busy) {
    setBusy(true)
    api<{ factor_id: string; qr_code: string; secret: string; uri: string }>('/api/settings/security', { method: 'POST', json: { action: 'mfa-enroll' } })
      .then(setEnr).catch((e) => setEnrErr(e.message)).finally(() => setBusy(false))
  }
  const submit = async () => {
    if (!enr) return
    setBusy(true); setErr(null)
    try { await api('/api/settings/security', { method: 'POST', json: { action: 'mfa-verify', factor_id: enr.factor_id, code } }); onDone() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const qr = enr?.qr_code ? (enr.qr_code.startsWith('data:') ? enr.qr_code : `data:image/svg+xml;utf8,${encodeURIComponent(enr.qr_code)}`) : null
  return (
    <Modal title="Ativar verificação em duas etapas" desc="Escaneie o QR code com Google Authenticator, Authy, 1Password ou outro app e digite o código gerado." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!enr || code.length !== 6 || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Ativar</button></>}>
      {enrErr ? <div className="field-err">{enrErr}</div> : !enr ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-3)', fontSize: 14 }}><I n="refresh" s={16} className="spin" />Gerando QR code…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,180px) 1fr', gap: 20, alignItems: 'start' }} className="enroll-grid">
          {qr && <img src={qr} alt="QR code do autenticador" style={{ width: 180, height: 180, borderRadius: 10, border: '1px solid var(--line-2)', background: '#fff' }} />}
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <div>
              <span className="inl">Não consegue escanear? Digite a chave no app</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><code style={{ fontFamily: 'var(--mono)', fontSize: 12.5, wordBreak: 'break-all', color: 'var(--text-2)' }}>{enr.secret}</code><CopyBtn text={enr.secret} small /></div>
            </div>
            <Field label="Código de 6 dígitos" error={err}>
              <input className={'in mono' + (err ? ' err' : '')} inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) submit() }} />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  )
}

function DisableModal({ factorId, onClose, onDone }: { factorId: string; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setErr(null)
    try { await api('/api/settings/security', { method: 'POST', json: { action: 'mfa-disable', factor_id: factorId, password } }); onDone() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Desativar verificação em duas etapas" desc="Sua conta fica protegida só pela senha. Confirme a senha para continuar." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Manter ativa</button><button type="button" className="btn btn-primary" style={{ background: 'var(--neg)' }} disabled={!password || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Desativar</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (password && !busy) submit() }}>
        <Field label="Senha atual" error={err}><input className={'in' + (err ? ' err' : '')} type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      </form>
    </Modal>
  )
}

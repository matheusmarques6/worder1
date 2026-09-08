'use client'

// Configurações → Equipe e permissões (desenho PEquipe).

import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { useStoreStore } from '@/stores'
import { Card, Title, LoadingCard, Badge, Avatar, Modal, Field, IconBtn } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, timeAgo } from '@/components/settings/format'
import { useApi, useAction } from '@/components/settings/hooks'
import { ASSIGNABLE_ROLES, ROLE_MATRIX, roleLabel } from '@/lib/settings/roles'

interface Member { id: string; user_id: string | null; email: string; name: string; avatar_url: string | null; role: string; role_label: string; status: 'active' | 'invited'; invited_at: string | null; last_seen_at: string | null; mfa_enabled: boolean | null; is_me: boolean }
interface Resp { members: Member[]; me: { id: string; role: string | null } | null; require_2fa: boolean }

export default function TeamSettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/users')
  const { currentStore } = useStoreStore()
  const storeName = (currentStore as any)?.shop_name || (currentStore as any)?.name || 'sua organização'
  const confirm = useConfirm()
  const toast = useToast()
  const { busy, run } = useAction()
  const [invite, setInvite] = useState(false)
  const canManage = ['owner', 'admin'].includes(data?.me?.role || '')

  const changeRole = async (m: Member, role: string) => {
    await run(`role-${m.id}`, async () => { await api('/api/settings/users', { method: 'PATCH', json: { id: m.id, role } }); await reload(true) }, { success: `${m.name || m.email} agora é ${roleLabel(role)}` })
  }
  const resend = (m: Member) => run(`resend-${m.id}`, async () => { await api('/api/settings/users', { method: 'POST', json: { id: m.id, resend: true } }) }, { success: 'Convite reenviado', error: 'Não foi possível reenviar' })
  const remove = async (m: Member) => {
    const invited = m.status === 'invited'
    const ok = await confirm.confirm({ title: invited ? 'Cancelar convite?' : `Remover ${m.name || m.email}?`, description: invited ? 'O link do convite deixa de funcionar.' : 'A pessoa perde o acesso imediatamente. Campanhas e automações criadas por ela continuam.', confirmLabel: invited ? 'Cancelar convite' : 'Remover', destructive: true })
    if (!ok) return
    await run(`rm-${m.id}`, async () => { await api('/api/settings/users', { method: 'DELETE', json: { id: m.id } }); await reload(true) }, { success: invited ? 'Convite cancelado' : 'Pessoa removida' })
  }

  return (
    <>
      <Title h="Equipe e permissões" p={`Quem acessa ${storeName} e o que cada pessoa pode fazer.`} right={canManage ? <button type="button" className="btn btn-primary" onClick={() => setInvite(true)}><I n="plus" s={15} />Convidar pessoa</button> : undefined} />
      {loading && !data ? <LoadingCard rows={4} /> : error ? (
        <Card><div className="empty2"><b>Não foi possível carregar a equipe</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : (
        <Card flush>
          <div className="tw"><table className="stbl">
            <thead><tr><th>Pessoa</th><th>Função</th><th>Status</th><th className="hm">Último acesso</th><th></th></tr></thead>
            <tbody>
              {(data?.members || []).map((m) => (
                <tr key={m.id}>
                  <td className="fx"><div className="person"><Avatar name={m.name || m.email} src={m.avatar_url} sm /><div><span className="nm">{m.name || m.email.split('@')[0]}{m.is_me && <Badge k="acc" dot={false} style={{ marginLeft: 8 }}>Você</Badge>}</span><span className="mt">{m.email}</span></div></div></td>
                  <td>
                    {m.role === 'owner' || !canManage || m.is_me ? m.role_label : (
                      <select className="in" style={{ height: 32, width: 170 }} value={m.role} disabled={busy === `role-${m.id}`} onChange={(e) => changeRole(m, e.target.value)} aria-label={`Função de ${m.name || m.email}`}>
                        {!ASSIGNABLE_ROLES.some((r) => r.value === m.role) && <option value={m.role}>{m.role_label}</option>}
                        {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {m.status === 'active' ? <Badge k="ok">Ativo</Badge> : <Badge k="warn">Pendente</Badge>}
                      {data?.require_2fa && m.status === 'active' && m.mfa_enabled === false && m.role !== 'owner' && <Badge k="err" dot={false}>2FA pendente</Badge>}
                    </div>
                  </td>
                  <td className="hm" style={{ color: 'var(--text-3)' }}>{m.status === 'invited' ? `Convite enviado ${timeAgo(m.invited_at).toLowerCase()}` : m.is_me ? 'Agora' : m.last_seen_at ? timeAgo(m.last_seen_at) : '—'}</td>
                  <td className="r"><div className="acts">
                    {canManage && m.status === 'invited' && <IconBtn n="refresh" s={15} title="Reenviar convite" onClick={() => resend(m)} disabled={busy === `resend-${m.id}`} className={busy === `resend-${m.id}` ? 'spin' : ''} />}
                    {canManage && m.role !== 'owner' && !m.is_me && <IconBtn n="x" title={m.status === 'invited' ? 'Cancelar convite' : 'Remover'} danger onClick={() => remove(m)} disabled={busy === `rm-${m.id}`} />}
                  </div></td>
                </tr>
              ))}
              {data && data.members.length === 0 && <tr><td colSpan={5}><div className="empty2"><b>Só você por aqui</b>Convide sua equipe para trabalhar junto.</div></td></tr>}
            </tbody>
          </table></div>
        </Card>
      )}

      <Card title="Funções" desc="O que cada função pode fazer." flush>
        <div className="tw"><table className="stbl">
          <thead><tr><th>Permissão</th><th>Administrador</th><th>Editor</th><th>Analista</th><th>Suporte</th></tr></thead>
          <tbody>
            {ROLE_MATRIX.map(([p, ...c]) => (
              <tr key={p}><td>{p}</td>{c.map((v, i) => <td key={i}>{v ? <I n="check" s={16} c="var(--pos)" /> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>)}</tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {invite && <InviteModal onClose={() => setInvite(false)} onDone={(email, active) => { setInvite(false); toast.success(active ? 'Pessoa adicionada' : 'Convite enviado', active ? `${email} já tem acesso.` : `${email} recebeu um e-mail para criar a senha.`); reload(true) }} />}
    </>
  )
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: (email: string, active: boolean) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('member')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await api<{ status?: string }>('/api/settings/users', { method: 'POST', json: { email, name, role } })
      onDone(email.trim().toLowerCase(), r?.status === 'active')
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const desc = ASSIGNABLE_ROLES.find((r) => r.value === role)?.desc
  return (
    <Modal title="Convidar pessoa" desc="Ela recebe um e-mail para criar a senha e entra direto na sua organização." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Enviar convite</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok && !busy) submit() }} style={{ display: 'grid', gap: 14 }}>
        <Field label="E-mail" error={err}><input className={'in' + (err ? ' err' : '')} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com.br" /></Field>
        <Field label="Nome (opcional)"><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como aparece na equipe" /></Field>
        <Field label="Função">
          <select className="in" value={role} onChange={(e) => setRole(e.target.value)}>{ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          {desc && <div className="hp" style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>{desc}</div>}
        </Field>
      </form>
    </Modal>
  )
}

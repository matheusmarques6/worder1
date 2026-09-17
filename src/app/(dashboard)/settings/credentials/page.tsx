'use client'

// Configurações → Credenciais: chaves de serviços externos usadas pelas
// automações (WhatsApp, e-mail, Shopify, HTTP). Guardadas criptografadas.

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Title, LoadingCard, Modal, Field, IconBtn, Badge, Pill } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, timeAgo } from '@/components/settings/format'
import { useApi, useAction } from '@/components/settings/hooks'
import { CREDENTIAL_TYPES, credentialType, type CredentialType } from '@/lib/settings/credential-types'

interface Cred { id: string; name: string; type: string; created_at: string; last_used_at: string | null; last_test_at: string | null; last_test_success: boolean | null; automations_using: string[] | null }

export default function CredentialsSettingsPage() {
  const { data, loading, error, reload } = useApi<{ credentials: Cred[] }>('/api/credentials')
  const toast = useToast()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [modal, setModal] = useState<{ mode: 'new' } | { mode: 'edit'; cred: Cred } | null>(null)

  const test = (c: Cred) => run(`t-${c.id}`, async () => {
    const r = await api<{ success: boolean; error?: string }>('/api/credentials/test', { method: 'POST', json: { credentialId: c.id } })
    await reload(true)
    if (r.success) toast.success('Conexão OK', `${c.name} respondeu corretamente.`)
    else toast.error('Falha na conexão', r.error || 'O serviço não aceitou a credencial.')
  })
  const remove = async (c: Cred) => {
    const using = c.automations_using?.length || 0
    if (!(await confirm.confirm({ title: `Excluir “${c.name}”?`, description: using ? `${using} automaç${using === 1 ? 'ão usa' : 'ões usam'} esta credencial e vão falhar.` : 'A credencial é apagada de forma permanente.', confirmLabel: 'Excluir', destructive: true }))) return
    await run(`d-${c.id}`, async () => { await api(`/api/credentials/${c.id}`, { method: 'DELETE' }); await reload(true) }, { success: 'Credencial excluída' })
  }

  return (
    <>
      <Title h="Credenciais" p="Chaves e tokens de serviços externos que as automações usam. Ficam criptografadas e nunca aparecem por inteiro." right={<button type="button" className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}><I n="plus" s={15} />Nova credencial</button>} />
      {loading && !data ? <LoadingCard rows={3} /> : error || !data ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : (
        <Card flush>
          {data.credentials.length === 0 ? <div className="empty2"><b>Nenhuma credencial</b>Adicione a primeira para usar em automações (WhatsApp, e-mail, APIs).<div><button type="button" className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}><I n="plus" s={15} />Nova credencial</button></div></div> : (
            <div className="tw"><table className="stbl">
              <thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th className="hm">Em uso</th><th></th></tr></thead>
              <tbody>
                {data.credentials.map((c) => {
                  const t = credentialType(c.type)
                  return (
                    <tr key={c.id}>
                      <td className="fx"><span className="nm">{c.name}</span><span className="mt">{c.last_used_at ? `Usada ${timeAgo(c.last_used_at).toLowerCase()}` : `Criada ${timeAgo(c.created_at).toLowerCase()}`}</span></td>
                      <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><I n={t?.icon || 'key'} s={16} c="var(--text-3)" />{t?.name || c.type}</div></td>
                      <td>{c.last_test_success === true ? <Badge k="ok">Conectada</Badge> : c.last_test_success === false ? <Badge k="err">Falhou</Badge> : <Badge k="off">Não testada</Badge>}</td>
                      <td className="hm" style={{ color: 'var(--text-3)' }}>{c.automations_using?.length ? `${c.automations_using.length} automaç${c.automations_using.length === 1 ? 'ão' : 'ões'}` : '—'}</td>
                      <td className="r"><div className="acts">
                        {(t?.testable ?? true) && <IconBtn n="play" s={15} title="Testar conexão" onClick={() => test(c)} disabled={busy === `t-${c.id}`} className={busy === `t-${c.id}` ? 'spin' : ''} />}
                        <IconBtn n="edit" s={15} title="Editar" onClick={() => setModal({ mode: 'edit', cred: c })} />
                        <IconBtn n="x" title="Excluir" danger onClick={() => remove(c)} disabled={busy === `d-${c.id}`} />
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </Card>
      )}
      {modal && <CredModal cred={modal.mode === 'edit' ? modal.cred : null} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(true) }} />}
    </>
  )
}

function CredModal({ cred, onClose, onDone }: { cred: Cred | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [type, setType] = useState<CredentialType | null>(cred ? credentialType(cred.type) || null : null)
  const [name, setName] = useState(cred?.name || '')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const detail = useApi<{ credential: { masked_fields?: Record<string, string> } }>(cred ? `/api/credentials/${cred.id}` : null)
  const masked = detail.data?.credential?.masked_fields || {}

  const ok = !!type && name.trim().length >= 2 && type.fields.filter((f) => f.required).every((f) => (vals[f.name] || '').trim() || (cred && masked[f.name]))
  const submit = async () => {
    if (!type) return
    setBusy(true); setErr(null)
    try {
      const data: Record<string, string> = {}
      for (const f of type.fields) if ((vals[f.name] || '').trim()) data[f.name] = vals[f.name].trim()
      if (cred) await api(`/api/credentials/${cred.id}`, { method: 'PUT', json: { name: name.trim(), data } })
      else await api('/api/credentials', { method: 'POST', json: { name: name.trim(), type: type.type, data } })
      toast.success(cred ? 'Credencial atualizada' : 'Credencial criada')
      onDone()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={cred ? `Editar ${cred.name}` : type ? `Nova credencial · ${type.name}` : 'Nova credencial'} desc={type ? type.description : 'Escolha o serviço.'} onClose={onClose} size={type ? 'md' : 'lg'}
      footer={type ? <>{!cred && <button type="button" className="btn" onClick={() => setType(null)}>Voltar</button>}<button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}{cred ? 'Salvar' : 'Criar'}</button></> : <button type="button" className="btn" onClick={onClose}>Cancelar</button>}>
      {!type ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
          {CREDENTIAL_TYPES.map((t) => (
            <button key={t.type} type="button" className="radio" onClick={() => setType(t)} style={{ alignItems: 'center' }}><I n={t.icon} s={18} c="var(--text-2)" /><div><b>{t.name}</b><span>{t.description}</span></div></button>
          ))}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (ok && !busy) submit() }} style={{ display: 'grid', gap: 14 }}>
          <Field label="Nome" error={err}><input className={'in' + (err ? ' err' : '')} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`${type.name} — produção`} /></Field>
          {type.fields.map((f) => (
            <Field key={f.name} label={<>{f.label}{!f.required && <span className="muted"> (opcional)</span>}</>}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className={'in' + (f.type === 'password' ? ' mono' : '')} type={f.type === 'password' && !show[f.name] ? 'password' : f.type === 'number' ? 'number' : 'text'} value={vals[f.name] || ''} onChange={(e) => setVals((o) => ({ ...o, [f.name]: e.target.value }))} placeholder={cred && masked[f.name] ? `${masked[f.name]} (deixe vazio para manter)` : f.placeholder} autoComplete="off" />
                {f.type === 'password' && <button type="button" className="ib" title={show[f.name] ? 'Ocultar' : 'Mostrar'} onClick={() => setShow((o) => ({ ...o, [f.name]: !o[f.name] }))}><I n={show[f.name] ? 'eyeOff' : 'eye'} s={16} /></button>}
              </div>
              {f.help && <div className="hp" style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>{f.help}</div>}
            </Field>
          ))}
          {cred && detail.loading && <div className="muted" style={{ fontSize: 13 }}>Carregando valores atuais…</div>}
        </form>
      )}
    </Modal>
  )
}

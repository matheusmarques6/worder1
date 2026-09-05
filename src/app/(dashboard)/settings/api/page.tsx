'use client'

// Configurações → Chaves de API (desenho PApi).

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, Title, LoadingCard, Modal, Field, IconBtn, Kv, Code, CopyBtn, Pill } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, timeAgo, nf } from '@/components/settings/format'
import { useApi, useAction } from '@/components/settings/hooks'

interface Key { id: string; name: string; masked: string; permissions: string[]; created_at: string; last_used_at: string | null; created_by: string | null; legacy: boolean }
interface Resp { keys: Key[]; permissions: Array<{ key: string; label: string }>; limits: { per_minute: number; bulk_import: number }; base_url: string; can_manage: boolean }

export default function ApiKeysSettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/api-keys')
  const toast = useToast()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [create, setCreate] = useState(false)
  const [reveal, setReveal] = useState<{ name: string; key: string } | null>(null)

  const regenerate = async (k: Key) => {
    if (!(await confirm.confirm({ title: `Regenerar “${k.name}”?`, description: 'A chave atual para de funcionar na hora. Atualize a integração com a nova.', confirmLabel: 'Regenerar', destructive: true }))) return
    const r = await run(`rg-${k.id}`, async () => api<{ api_key: string }>('/api/settings/api-keys', { method: 'POST', json: { id: k.id, regenerate: true } }))
    if (r?.api_key) { setReveal({ name: k.name, key: r.api_key }); reload(true) }
  }
  const revoke = async (k: Key) => {
    if (!(await confirm.confirm({ title: `Revogar “${k.name}”?`, description: 'Integrações usando esta chave param de funcionar imediatamente.', confirmLabel: 'Revogar', destructive: true }))) return
    await run(`rv-${k.id}`, async () => { await api('/api/settings/api-keys', { method: 'DELETE', json: { id: k.id } }); await reload(true) }, { success: 'Chave revogada' })
  }

  const base = data?.base_url || 'https://app.worder.com.br/api/v1'
  const curl = `curl ${base}/contacts \\\n  -H "Authorization: Bearer wk_live_..." \\\n  -H "Content-Type: application/json"`

  return (
    <>
      <Title h="Chaves de API" p="Acesso programático à sua conta. Trate como senha." right={data?.can_manage !== false ? <button type="button" className="btn btn-primary" onClick={() => setCreate(true)}><I n="plus" s={15} />Criar chave</button> : undefined} />
      {loading && !data ? <LoadingCard rows={3} /> : error || !data ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : (
        <Card flush>
          {data.keys.length === 0 ? <div className="empty2"><b>Nenhuma chave ainda</b>Crie uma chave para integrar ERP, Zapier ou seu próprio sistema.<div><button type="button" className="btn btn-primary" onClick={() => setCreate(true)}><I n="plus" s={15} />Criar chave</button></div></div> : (
            <div className="tw"><table className="stbl">
              <thead><tr><th>Nome</th><th>Chave</th><th>Permissões</th><th className="hm">Último uso</th><th></th></tr></thead>
              <tbody>
                {data.keys.map((k) => (
                  <tr key={k.id}>
                    <td className="fx"><span className="nm">{k.name}</span><span className="mt">{k.created_by ? `Criada por ${k.created_by}` : `Criada ${timeAgo(k.created_at).toLowerCase()}`}{k.legacy ? ' · formato antigo — regenere' : ''}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, whiteSpace: 'nowrap' }}>{k.masked}</td>
                    <td><div className="pillrow">{k.permissions.length ? k.permissions.map((p) => <Pill key={p}>{p}</Pill>) : <Pill title="Chave antiga sem escopo — regenere para definir permissões">todas</Pill>}</div></td>
                    <td className="hm" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{k.last_used_at ? timeAgo(k.last_used_at) : 'nunca'}</td>
                    <td className="r"><div className="acts"><IconBtn n="refresh" s={15} title="Regenerar" onClick={() => regenerate(k)} disabled={busy === `rg-${k.id}`} /><IconBtn n="x" title="Revogar" danger onClick={() => revoke(k)} disabled={busy === `rv-${k.id}`} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      )}

      <Card title="Começando">
        <Row label="Endpoint"><Code>{curl}</Code></Row>
        <Row label="Limites" help="Por chave."><Kv items={[['Requisições', `${nf(data?.limits.per_minute || 600)} / min`], ['Importação em lote', `${nf(data?.limits.bulk_import || 10000)} contatos / chamada`]]} /></Row>
        <Row label="Recursos"><div className="pillrow"><Pill>GET /contacts</Pill><Pill>POST /contacts</Pill><Pill>POST /events</Pill></div></Row>
        <Row label="Documentação"><div><a href="https://docs.worder.com.br" target="_blank" rel="noreferrer" style={{ color: 'var(--acc-ink)', fontWeight: 500 }}>docs.worder.com.br →</a></div></Row>
      </Card>

      {create && data && <CreateModal perms={data.permissions} onClose={() => setCreate(false)} onDone={(name, key) => { setCreate(false); setReveal({ name, key }); reload(true) }} />}
      {reveal && (
        <Modal title="Copie a chave agora" desc={<>Por segurança, a chave <b>{reveal.name}</b> só aparece uma vez. Guarde em um lugar seguro.</>} onClose={() => setReveal(null)} footer={<button type="button" className="btn btn-primary" onClick={() => { setReveal(null); toast.info('Chave guardada?', 'Se perdeu, regenere a chave na lista.') }}>Já copiei</button>}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="in mono" readOnly value={reveal.key} onFocus={(e) => e.currentTarget.select()} /><CopyBtn text={reveal.key} /></div>
        </Modal>
      )}
    </>
  )
}

function CreateModal({ perms, onClose, onDone }: { perms: Array<{ key: string; label: string }>; onClose: () => void; onDone: (name: string, key: string) => void }) {
  const [name, setName] = useState('')
  const [sel, setSel] = useState<string[]>(['contacts:read'])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toggle = (k: string) => setSel((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]))
  const ok = name.trim().length >= 2 && sel.length > 0
  const submit = async () => {
    setBusy(true); setErr(null)
    try { const r = await api<{ api_key: string }>('/api/settings/api-keys', { method: 'POST', json: { name: name.trim(), permissions: sel } }); onDone(name.trim(), r.api_key) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Criar chave de API" desc="Dê um nome que identifique a integração e escolha só as permissões necessárias." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Criar chave</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok && !busy) submit() }} style={{ display: 'grid', gap: 14 }}>
        <Field label="Nome" error={err}><input className={'in' + (err ? ' err' : '')} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Integração ERP" /></Field>
        <div>
          <span className="inl">Permissões</span>
          <div style={{ display: 'grid', gap: 8 }}>
            {perms.map((p) => (
              <label key={p.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={sel.includes(p.key)} onChange={() => toggle(p.key)} /><span style={{ fontFamily: 'var(--mono)', fontSize: 13, minWidth: 130 }}>{p.key}</span><span style={{ color: 'var(--text-2)' }}>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}

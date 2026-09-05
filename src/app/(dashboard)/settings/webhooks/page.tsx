'use client'

// Configurações → Webhooks (desenho PWebhooks): endpoints que recebem eventos
// da loja em tempo real, assinados com HMAC SHA-256.

import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { Card, Row, Title, LoadingCard, Badge, IconBtn, Pill, Code } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, fmtDate } from '@/components/settings/format'
import { useApi, useAction } from '@/components/settings/hooks'

interface Sub { id: string; name: string; url: string; events: string[]; status: 'active' | 'paused' | 'disabled' | string; store_id: string | null; created_at: string }
interface Stats { [id: string]: { ok: number; failed: number } }

export default function WebhooksSettingsPage() {
  const { data, loading, error, reload } = useApi<{ subscriptions: Sub[] }>('/api/webhooks-admin/subscriptions')
  const stats = useApi<{ stats: Stats }>('/api/webhooks-admin/deliveries/stats')
  const confirm = useConfirm()
  const toast = useToast()
  const { busy, run } = useAction()

  const remove = async (s: Sub) => {
    if (!(await confirm.confirm({ title: `Remover ${s.name}?`, description: 'O endpoint deixa de receber eventos imediatamente.', confirmLabel: 'Remover', destructive: true }))) return
    await run(`rm-${s.id}`, async () => { await api(`/api/webhooks-admin/subscriptions/${s.id}`, { method: 'DELETE' }); await reload(true) }, { success: 'Webhook removido' })
  }
  const test = (s: Sub) => run(`t-${s.id}`, async () => { await api(`/api/webhooks-admin/subscriptions/${s.id}/test`, { method: 'POST' }); toast.success('Evento de teste enviado', `Veja o resultado em Logs de ${s.name}.`) }, { error: 'Não foi possível enviar o teste' })
  const badge = (s: Sub, st?: { ok: number; failed: number }) => {
    if (s.status !== 'active') return <Badge k="off">{s.status === 'paused' ? 'Pausado' : 'Desativado'}</Badge>
    if (st && st.failed > 0 && st.failed >= st.ok) return <Badge k="err">Falhando</Badge>
    return <Badge k="ok">Ativo</Badge>
  }

  return (
    <>
      <Title h="Webhooks" p="Receba eventos da sua loja em tempo real em qualquer URL. Assinados com HMAC SHA-256." right={<Link href="/settings/webhooks/new" className="btn btn-primary"><I n="plus" s={15} />Novo endpoint</Link>} />
      {loading && !data ? <LoadingCard rows={3} /> : error || !data ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : (
        <Card flush>
          {data.subscriptions.length === 0 ? <div className="empty2"><b>Nenhum endpoint</b>Crie um webhook para receber pedidos, checkouts abandonados e clientes novos no seu sistema.<div><Link href="/settings/webhooks/new" className="btn btn-primary"><I n="plus" s={15} />Novo endpoint</Link></div></div> : (
            <div className="tw"><table className="stbl">
              <thead><tr><th>Endpoint</th><th>Eventos</th><th>Status</th><th className="r hm">Últimas 24 h</th><th></th></tr></thead>
              <tbody>
                {data.subscriptions.map((s) => {
                  const st = stats.data?.stats?.[s.id]
                  const ev = s.events || []
                  return (
                    <tr key={s.id}>
                      <td className="fx"><span className="nm" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{s.url}</span><span className="mt">{s.name} · criado em {fmtDate(s.created_at)}</span></td>
                      <td><div className="pillrow">{ev.slice(0, 2).map((e) => <Pill key={e}>{e}</Pill>)}{ev.length > 2 && <Pill title={ev.slice(2).join(', ')}>+{ev.length - 2}</Pill>}</div></td>
                      <td>{badge(s, st)}</td>
                      <td className="r hm" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{st ? `${st.ok} ok · ${st.failed} falhas` : '—'}</td>
                      <td className="r"><div className="acts">
                        <IconBtn n="send" s={15} title="Testar" onClick={() => test(s)} disabled={busy === `t-${s.id}`} />
                        <Link href={`/settings/webhooks/${s.id}/deliveries`} className="ib" title="Logs"><I n="list" s={15} /></Link>
                        <Link href={`/settings/webhooks/${s.id}/edit`} className="ib" title="Editar"><I n="gear" s={15} /></Link>
                        <IconBtn n="x" title="Remover" danger onClick={() => remove(s)} disabled={busy === `rm-${s.id}`} />
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </Card>
      )}
      <Card title="Assinatura" desc="Cada endpoint tem o próprio segredo — mostrado uma vez ao criar e rotacionável em Editar.">
        <Row label="Validação" help="Compare o header X-Worder-Signature com o HMAC SHA-256 do corpo bruto usando o segredo do endpoint.">
          <Code wrap>{`const sig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex')\nif (sig !== req.headers['x-worder-signature']) return res.status(401).end()`}</Code>
        </Row>
      </Card>
    </>
  )
}

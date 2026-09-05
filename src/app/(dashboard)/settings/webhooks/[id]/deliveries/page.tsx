'use client'

// Webhooks → Logs de entregas de um endpoint.

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Title, Badge, IconBtn } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, fmtDate } from '@/components/settings/format'
import { useApi } from '@/components/settings/hooks'
import DeliveryDetailDrawer from '@/components/webhooks/DeliveryDetailDrawer'

interface Delivery { id: string; event_type: string; status: 'pending' | 'in_flight' | 'delivered' | 'failed' | 'retrying'; response_code: number | null; attempt_count: number; max_attempts: number; created_at: string; last_attempt_at: string | null }
const LABEL: Record<Delivery['status'], string> = { pending: 'Pendente', in_flight: 'Em andamento', delivered: 'Entregue', failed: 'Falha', retrying: 'Reentregando' }
const KIND: Record<Delivery['status'], 'ok' | 'warn' | 'err' | 'off' | 'acc'> = { pending: 'off', in_flight: 'acc', delivered: 'ok', failed: 'err', retrying: 'warn' }
const MAX = 50

export default function WebhookDeliveriesPage() {
  const params = useParams()
  const id = String(params?.id || '')
  const [status, setStatus] = useState('')
  const { data, loading, error, reload } = useApi<{ deliveries: Delivery[] }>(id ? `/api/webhooks-admin/deliveries?subscription_id=${id}${status ? `&status=${status}` : ''}` : null, [status])
  const sub = useApi<{ subscription: { name: string; url: string } }>(id ? `/api/webhooks-admin/subscriptions/${id}` : null)
  const toast = useToast()
  const confirm = useConfirm()
  const [sel, setSel] = useState<string | null>(null)
  const [replaying, setReplaying] = useState(false)

  const replayFailed = async () => {
    const failed = (data?.deliveries || []).filter((d) => d.status === 'failed').slice(0, MAX)
    if (!failed.length) { toast.info('Nenhuma falha para reenviar'); return }
    if (!(await confirm.confirm({ title: `Reenviar ${failed.length} entrega${failed.length === 1 ? '' : 's'} com falha?`, description: 'Voltam para a fila de envio agora.', confirmLabel: 'Reenviar' }))) return
    setReplaying(true)
    let ok = 0
    for (const d of failed) { try { await api(`/api/webhooks-admin/deliveries/${d.id}/replay`, { method: 'POST' }); ok++ } catch { /* conta como falha */ } }
    setReplaying(false)
    if (ok === failed.length) toast.success(`${ok} reenviada${ok === 1 ? '' : 's'}`)
    else toast.warning(`${ok} de ${failed.length} reenviadas`, 'Algumas não puderam ser reenviadas.')
    reload(true)
  }

  return (
    <>
      <Title h="Logs de entregas" p={sub.data?.subscription ? `${sub.data.subscription.name} · ${sub.data.subscription.url}` : 'Últimas 100 tentativas. Entregas retidas por 30 dias.'} right={<Link href="/settings/webhooks" className="lnk"><I n="chevL" s={15} />Voltar para Webhooks</Link>} />
      <Card right={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="in" style={{ height: 34, width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status"><option value="">Todos os status</option><option value="delivered">Entregues</option><option value="failed">Falhas</option><option value="retrying">Reentregando</option><option value="pending">Pendentes</option></select>
        <IconBtn n="refresh" s={15} title="Atualizar" onClick={() => reload(true)} className={loading ? 'spin' : ''} />
        <button type="button" className="btn btn-sm" onClick={replayFailed} disabled={replaying}>{replaying && <I n="refresh" s={13} className="spin" />}Reenviar falhas (até {MAX})</button>
      </div>} title="Entregas" flush>
        {loading && !data ? <div className="sc-b"><div className="sk w60" /><div className="sk w80" /><div className="sk w40" /></div> : error ? <div className="empty2">{error}</div> : !data?.deliveries.length ? (
          <div className="empty2"><b>Nenhuma entrega registrada</b>Dispare um teste em Editar → Testar entrega para ver o primeiro registro.</div>
        ) : (
          <div className="tw"><table className="stbl">
            <thead><tr><th>Evento</th><th>Status</th><th className="r">HTTP</th><th className="r hm">Tentativas</th><th className="hm">Criado</th><th className="hm">Última tentativa</th></tr></thead>
            <tbody>
              {data.deliveries.map((d) => (
                <tr key={d.id} onClick={() => setSel(d.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{d.event_type}</td>
                  <td><Badge k={KIND[d.status] || 'off'}>{LABEL[d.status] || d.status}</Badge></td>
                  <td className="r">{d.response_code ?? '—'}</td>
                  <td className="r hm">{d.attempt_count}/{d.max_attempts}</td>
                  <td className="hm" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(d.created_at, true)}</td>
                  <td className="hm" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{d.last_attempt_at ? fmtDate(d.last_attempt_at, true) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      {sel && <DeliveryDetailDrawer deliveryId={sel} onClose={() => setSel(null)} onReplay={() => reload(true)} />}
    </>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, Title, LoadingCard, Modal, CopyBtn } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api } from '@/components/settings/format'
import { useApi, useAction } from '@/components/settings/hooks'
import WebhookEditor, { type WebhookSub } from '@/components/settings/WebhookEditor'

export default function EditWebhookPage() {
  const params = useParams()
  const id = String(params?.id || '')
  const { data, loading, error, reload } = useApi<{ subscription: WebhookSub }>(id ? `/api/webhooks-admin/subscriptions/${id}` : null)
  const toast = useToast()
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const [secret, setSecret] = useState<string | null>(null)

  const rotate = async () => {
    if (!(await confirm.confirm({ title: 'Rotacionar o segredo?', description: 'O segredo antigo continua válido por 24 h (assinatura dupla) para você trocar sem derrubar a integração.', confirmLabel: 'Rotacionar' }))) return
    const r = await run('rot', async () => api<{ secret: string }>(`/api/webhooks-admin/subscriptions/${id}`, { method: 'PATCH', json: { regenerate_secret: true } }), { error: 'Não foi possível rotacionar' })
    if (r?.secret) setSecret(r.secret)
  }
  const test = () => run('test', async () => { await api(`/api/webhooks-admin/subscriptions/${id}/test`, { method: 'POST' }); toast.success('Teste disparado', 'Veja o resultado em Logs em alguns segundos.') }, { error: 'Não foi possível testar' })

  return (
    <>
      <Title h="Editar endpoint" p={data?.subscription?.name || ''} right={<><Link href={`/settings/webhooks/${id}/deliveries`} className="btn"><I n="list" s={15} />Logs</Link><button type="button" className="btn" onClick={test} disabled={busy === 'test'}><I n="send" s={15} />Testar entrega</button><button type="button" className="btn" onClick={rotate} disabled={busy === 'rot'}><I n="refresh" s={15} className={busy === 'rot' ? 'spin' : ''} />Rotacionar segredo</button></>} />
      {loading && !data ? <LoadingCard rows={4} /> : error || !data?.subscription ? (
        <Card><div className="empty2"><b>Webhook não encontrado</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : <WebhookEditor initial={data.subscription} />}
      {secret && (
        <Modal title="Novo segredo" desc="Copie agora. O antigo expira em 24 horas." onClose={() => setSecret(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setSecret(null)}>Já copiei</button>}>
          <Row label="Segredo"><div style={{ display: 'flex', gap: 8 }}><input className="in mono" readOnly value={secret} onFocus={(e) => e.currentTarget.select()} /><CopyBtn text={secret} /></div></Row>
        </Modal>
      )}
    </>
  )
}

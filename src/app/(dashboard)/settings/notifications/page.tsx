'use client'

// Configurações → Notificações (desenho PNotif): matriz evento × canal.

import { useEffect } from 'react'
import Link from 'next/link'
import { Card, Title, LoadingCard, SaveBar, Tog, useForm } from '@/components/settings/ui'
import { api } from '@/components/settings/format'
import { useApi, useSave } from '@/components/settings/hooks'
import type { NotificationMatrix } from '@/lib/settings/notifications'

interface Ev { key: string; title: string; help: string }
interface Resp { notifications: NotificationMatrix; phone: string | null; events: Ev[] }

export default function NotificationsSettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/notifications')
  return (
    <>
      <Title h="Notificações" p="O que você quer receber e por onde." />
      {loading && !data ? <LoadingCard rows={6} /> : error ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : data ? <MatrixCard data={data} onSaved={() => reload(true)} /> : null}
    </>
  )
}

function MatrixCard({ data, onSaved }: { data: Resp; onSaved: () => void }) {
  const f = useForm<Record<string, { email: boolean; whatsapp: boolean }>>(data.notifications as any)
  useEffect(() => { f.reset(data.notifications as any) }, [JSON.stringify(data.notifications)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save, setError } = useSave()
  const onSave = () => save(async () => {
    const r = await api<{ warning?: string | null }>('/api/settings/notifications', { method: 'PUT', json: { notifications: f.val } })
    onSaved()
    if (r.warning) setError(r.warning)
  })
  const toggle = (k: string, ch: 'email' | 'whatsapp') => (v: boolean) => f.set(k, { ...(f.val?.[k] || { email: false, whatsapp: false }), [ch]: v })
  const wantsWa = Object.values(f.val || {}).some((c) => c.whatsapp)
  const hint = wantsWa && !data.phone ? <>Avisos por WhatsApp precisam do seu telefone. <Link href="/settings/account" style={{ color: 'var(--acc-ink)', fontWeight: 500 }}>Cadastrar em Perfil</Link></> : undefined
  return (
    <Card foot={<SaveBar dirty={f.dirty} saving={saving} error={error} hint={hint} onSave={onSave} onCancel={f.cancel} />}>
      <div className="notif" style={{ borderTop: 'none' }}><div></div><div className="h">E-mail</div><div className="h">WhatsApp</div></div>
      {data.events.map((e) => (
        <div className="notif" key={e.key}>
          <div>{e.title}<div className="hp">{e.help}</div></div>
          <div className="c"><Tog on={!!f.val?.[e.key]?.email} set={toggle(e.key, 'email')} label={`${e.title} por e-mail`} /></div>
          <div className="c"><Tog on={!!f.val?.[e.key]?.whatsapp} set={toggle(e.key, 'whatsapp')} label={`${e.title} por WhatsApp`} /></div>
        </div>
      ))}
    </Card>
  )
}

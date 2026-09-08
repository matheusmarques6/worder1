'use client'

// Configurações → Perfil (desenho PPerfil): informações pessoais e preferências.

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/stores'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, SaveBar, Title, LoadingCard, Modal, Avatar, useForm, Field } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, initials } from '@/components/settings/format'
import { useApi, useSave, useFilePicker, useAction } from '@/components/settings/hooks'
import { useSettingsTheme, type Theme } from '@/components/settings/theme'

interface Profile {
  id: string; email: string; full_name: string; phone: string; avatar_url: string | null; role: string
  preferences: { locale: string; timezone: string; date_format: string; time_format: string; theme: Theme }
}

const TIMEZONES: Array<[string, string]> = [
  ['America/Sao_Paulo', '(GMT-03:00) São Paulo'],
  ['America/Fortaleza', '(GMT-03:00) Fortaleza'],
  ['America/Manaus', '(GMT-04:00) Manaus'],
  ['America/Cuiaba', '(GMT-04:00) Cuiabá'],
  ['America/Rio_Branco', '(GMT-05:00) Rio Branco'],
  ['America/Noronha', '(GMT-02:00) Fernando de Noronha'],
  ['America/Buenos_Aires', '(GMT-03:00) Buenos Aires'],
  ['America/Santiago', '(GMT-04:00) Santiago'],
  ['America/Bogota', '(GMT-05:00) Bogotá'],
  ['America/Mexico_City', '(GMT-06:00) Cidade do México'],
  ['America/New_York', '(GMT-05:00) Nova York'],
  ['America/Los_Angeles', '(GMT-08:00) Los Angeles'],
  ['Europe/Lisbon', '(GMT+00:00) Lisboa'],
  ['Europe/London', '(GMT+00:00) Londres'],
  ['Europe/Madrid', '(GMT+01:00) Madri'],
  ['Europe/Berlin', '(GMT+01:00) Berlim'],
  ['Asia/Tokyo', '(GMT+09:00) Tóquio'],
  ['Australia/Sydney', '(GMT+10:00) Sydney'],
]

export default function ProfileSettingsPage() {
  const { data, loading, error, reload } = useApi<{ profile: Profile | null }>('/api/settings/account')
  const profile = data?.profile || null

  return (
    <>
      <Title h="Perfil" p="Seus dados de acesso. Alterações aqui valem para todas as lojas que você administra." />
      {loading && !data ? <><LoadingCard rows={4} /><LoadingCard rows={3} /></> : error ? (
        <Card><div className="empty2"><b>Não foi possível carregar seu perfil</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : profile ? (
        <>
          <PersonalCard profile={profile} onChanged={() => reload(true)} />
          <PreferencesCard profile={profile} onChanged={() => reload(true)} />
        </>
      ) : null}
    </>
  )
}

function PersonalCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { user, setUser } = useAuthStore()
  const f = useForm({ full_name: profile.full_name, phone: profile.phone })
  useEffect(() => { f.reset({ full_name: profile.full_name, phone: profile.phone }) }, [profile.full_name, profile.phone]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const { busy, run } = useAction()
  const [emailModal, setEmailModal] = useState(false)

  const upload = useCallback(async (file: File) => {
    await run('avatar', async () => {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api<{ avatar_url: string }>('/api/profile/avatar', { method: 'POST', body: fd })
      if (user) setUser({ ...user, avatar_url: r.avatar_url })
      onChanged()
    }, { success: 'Foto atualizada', error: 'Não foi possível enviar a foto' })
  }, [run, user, setUser, onChanged])
  const pick = useFilePicker('image/png,image/jpeg,image/webp,image/gif', upload)

  const removeAvatar = async () => {
    if (!(await confirm.confirm({ title: 'Remover foto?', description: 'Suas iniciais passam a aparecer no lugar.', confirmLabel: 'Remover', destructive: true }))) return
    await run('avatar-rm', async () => {
      await api('/api/profile/avatar', { method: 'DELETE' })
      if (user) setUser({ ...user, avatar_url: undefined })
      onChanged()
    }, { success: 'Foto removida' })
  }

  const onSave = () => save(async () => {
    await api('/api/settings/account', { method: 'PATCH', json: { type: 'profile', ...f.val } })
    if (user) setUser({ ...user, name: f.val!.full_name })
    onChanged()
  })

  return (
    <>
      <Card title="Informações pessoais" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
        <Row label="Foto">
          <div className="person">
            <Avatar name={f.val?.full_name || profile.email} src={profile.avatar_url} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={pick} disabled={busy === 'avatar'}>{busy === 'avatar' ? <I n="refresh" s={14} className="spin" /> : null}Enviar foto</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={removeAvatar} disabled={!profile.avatar_url || busy === 'avatar-rm'}>Remover</button>
            </div>
          </div>
        </Row>
        <Row label="Nome completo" htmlFor="pf-name">
          <input id="pf-name" className="in" value={f.val?.full_name || ''} onChange={(e) => f.set('full_name', e.target.value)} autoComplete="name" />
        </Row>
        <Row label="E-mail" help="Usado para login e notificações.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="in" readOnly value={profile.email} />
            <button type="button" className="btn" onClick={() => setEmailModal(true)}>Alterar</button>
          </div>
        </Row>
        <Row label="Telefone" help="Para alertas críticos por WhatsApp e recuperação de conta." htmlFor="pf-phone">
          <input id="pf-phone" className="in" placeholder="+55 (11) 99999-9999" value={f.val?.phone || ''} onChange={(e) => f.set('phone', e.target.value)} autoComplete="tel" inputMode="tel" />
        </Row>
      </Card>
      {emailModal && <ChangeEmailModal current={profile.email} onClose={() => setEmailModal(false)} onDone={(email) => { setEmailModal(false); toast.success('E-mail alterado', `Agora você entra com ${email}.`); if (user) setUser({ ...user, email }); onChanged() }} />}
    </>
  )
}

function ChangeEmailModal({ current, onClose, onDone }: { current: string; onClose: () => void; onDone: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.toLowerCase() !== current.toLowerCase() && password.length > 0
  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      await api('/api/settings/account', { method: 'PATCH', json: { type: 'email', email, password } })
      onDone(email.trim().toLowerCase())
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Alterar e-mail de acesso" desc={<>Você passa a entrar com o novo endereço. Notificações também vão para ele. E-mail atual: <b>{current}</b>.</>} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Salvar novo e-mail</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok && !busy) submit() }} style={{ display: 'grid', gap: 14 }}>
        <Field label="Novo e-mail"><input className="in" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" /></Field>
        <Field label="Confirme sua senha atual" error={err}><input className={'in' + (err ? ' err' : '')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      </form>
    </Modal>
  )
}

function PreferencesCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const { theme, setTheme } = useSettingsTheme()
  const init = { ...profile.preferences }
  const f = useForm(init)
  useEffect(() => { f.reset({ ...profile.preferences }) }, [JSON.stringify(profile.preferences)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const onSave = () => save(async () => {
    await api('/api/settings/account', { method: 'PATCH', json: { type: 'preferences', preferences: f.val } })
    onChanged()
  }, 'Preferências salvas')
  const themeNow = f.val?.theme || theme
  const pickTheme = (t: Theme) => { f.set('theme', t); setTheme(t, false) }
  const tzKnown = TIMEZONES.some(([v]) => v === f.val?.timezone)

  return (
    <Card title="Preferências" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={() => { f.cancel(); setTheme(f.orig?.theme || 'light', false) }} />}>
      <Row label="Idioma" htmlFor="pf-locale">
        <select id="pf-locale" className="in" value={f.val?.locale || 'pt-BR'} onChange={(e) => f.set('locale', e.target.value)}>
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en-US">English</option>
          <option value="es">Español</option>
        </select>
      </Row>
      <Row label="Fuso horário" help="Define horários de agendamento e relatórios." htmlFor="pf-tz">
        <select id="pf-tz" className="in" value={f.val?.timezone || 'America/Sao_Paulo'} onChange={(e) => f.set('timezone', e.target.value)}>
          {!tzKnown && f.val?.timezone && <option value={f.val.timezone}>{f.val.timezone}</option>}
          {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Row>
      <Row label="Formato de data">
        <div className="in2">
          <select className="in" aria-label="Formato de data" value={f.val?.date_format || 'DD/MM/YYYY'} onChange={(e) => f.set('date_format', e.target.value)}>
            <option value="DD/MM/YYYY">DD/MM/AAAA</option>
            <option value="MM/DD/YYYY">MM/DD/AAAA</option>
            <option value="YYYY-MM-DD">AAAA-MM-DD</option>
          </select>
          <select className="in" aria-label="Formato de hora" value={f.val?.time_format || '24h'} onChange={(e) => f.set('time_format', e.target.value)}>
            <option value="24h">24 horas</option>
            <option value="12h">12 horas</option>
          </select>
        </div>
      </Row>
      <Row label="Tema" help="Aparência das Configurações. “Sistema” segue o seu aparelho.">
        <div className="seg" role="radiogroup" aria-label="Tema">
          {([['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon'], ['system', 'Sistema', 'monitor']] as Array<[Theme, string, string]>).map(([k, l, ic]) => (
            <button key={k} type="button" role="radio" aria-checked={themeNow === k} className={themeNow === k ? 'on' : ''} onClick={() => pickTheme(k)}><I n={ic} s={14} style={{ marginRight: 6 }} />{l}</button>
          ))}
        </div>
      </Row>
    </Card>
  )
}

// mantém o helper importado em uso em componentes que só precisam das iniciais
void initials

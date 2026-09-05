// Configurações → Segurança.
//
// GET  → senha (última alteração), 2FA (fatores), exigir 2FA da equipe,
//        sessões ativas e histórico de login (30 dias).
// POST → { action }:
//   change-password  { current_password, new_password }
//   mfa-enroll       {}                          → { factor_id, qr_code, secret, uri }
//   mfa-verify       { factor_id, code }         → ativa o fator (e eleva a sessão a aal2)
//   mfa-disable      { factor_id, code? }        → remove o fator
//   require-2fa      { enabled }                 → organização exige 2FA (admin)
//   revoke-session   { id }                      → encerra uma sessão
//   revoke-others    {}                          → encerra todas menos a atual

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { validatePassword } from '@/lib/password-validation'
import { canRoleAccess } from '@/lib/auth/permissions'
import { requestMeta, jwtSessionId } from '@/lib/settings/request-meta'
import { gotrue, jwtAal } from '@/lib/settings/gotrue'
export const dynamic = 'force-dynamic'

function token(): string {
  return cookies().get('sb-access-token')?.value || ''
}

function cookieOpts(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge, path: '/' }
}

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const userId = auth.user.id
  const orgId = auth.user.organization_id
  const tk = token()
  const currentSid = jwtSessionId(tk)
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString()
    const [{ data: prof }, { data: org }, { data: factors }, { data: authSessions }, { data: mine }, { data: logins }] = await Promise.all([
      supabaseAdmin.from('profiles').select('preferences').eq('id', userId).single(),
      supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single(),
      supabaseAdmin.rpc('list_mfa_factors', { p_user_id: userId }),
      supabaseAdmin.rpc('list_auth_sessions', { p_user_id: userId }),
      supabaseAdmin.from('user_sessions').select('*').eq('user_id', userId).is('revoked_at', null),
      supabaseAdmin.from('auth_login_events').select('id, ip, user_agent, city, country, success, reason, created_at').eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(50),
    ])

    // Sessões vivas em auth.sessions, enriquecidas com o que gravamos no login.
    const byAuthId = new Map<string, any>()
    for (const s of (mine as any[]) || []) if (s.auth_session_id) byAuthId.set(s.auth_session_id, s)
    const sessions = ((authSessions as any[]) || []).map((s) => {
      const m = byAuthId.get(s.id)
      return {
        id: s.id,
        user_agent: m?.user_agent || (s.user_agent && !/node|vercel|undici/i.test(s.user_agent) ? s.user_agent : null),
        ip: m?.ip || s.ip || null,
        city: m?.city || null,
        country: m?.country || null,
        created_at: s.created_at,
        last_seen_at: m?.last_seen_at || s.updated_at,
        current: currentSid === s.id,
      }
    }).sort((a, b) => Number(b.current) - Number(a.current) || new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())

    const verified = ((factors as any[]) || []).filter((f) => f.status === 'verified')
    return NextResponse.json({
      password_changed_at: prof?.preferences?.password_changed_at || null,
      mfa: {
        enabled: verified.length > 0,
        factors: verified.map((f) => ({ id: f.id, type: f.factor_type, name: f.friendly_name, created_at: f.created_at })),
        aal: jwtAal(tk),
      },
      require_2fa: !!(org?.settings as any)?.require_2fa,
      can_manage_org: canRoleAccess(auth.user.role, 'org:settings:edit'),
      sessions,
      logins: (logins as any[]) || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const userId = auth.user.id
  const orgId = auth.user.organization_id
  const tk = token()
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')
  try {
    if (action === 'change-password') {
      const cur = String(body.current_password || '')
      const nw = String(body.new_password || '')
      if (!cur || !nw) return NextResponse.json({ error: 'Informe a senha atual e a nova.' }, { status: 400 })
      const v = validatePassword(nw)
      if (!v.isValid) return NextResponse.json({ error: 'A nova senha não atende aos requisitos.', details: v.errors }, { status: 400 })
      if (cur === nw) return NextResponse.json({ error: 'A nova senha precisa ser diferente da atual.' }, { status: 400 })
      const { error: pwErr } = await supabaseAdmin.auth.signInWithPassword({ email: auth.user.email, password: cur })
      if (pwErr) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: nw })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      const { data: prof } = await supabaseAdmin.from('profiles').select('preferences').eq('id', userId).single()
      await supabaseAdmin.from('profiles').update({ preferences: { ...(prof?.preferences || {}), password_changed_at: new Date().toISOString() }, must_change_password: false, updated_at: new Date().toISOString() }).eq('id', userId)
      // Outras sessões saem — só quem trocou a senha continua logado.
      await supabaseAdmin.rpc('revoke_other_auth_sessions', { p_user_id: userId, p_keep_session_id: jwtSessionId(tk) }).then(() => {}, () => {})
      await audit(orgId, userId, auth.user.email, 'security.password_changed', {}, request)
      return NextResponse.json({ ok: true })
    }

    if (action === 'mfa-enroll') {
      // Remove fatores não verificados que sobraram de tentativas anteriores.
      const { data: factors } = await supabaseAdmin.rpc('list_mfa_factors', { p_user_id: userId })
      for (const f of ((factors as any[]) || []).filter((x) => x.status !== 'verified')) {
        await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId }).catch(() => {})
      }
      const e = await gotrue.enrollTotp(tk, `Worder · ${new Date().toLocaleDateString('pt-BR')}`)
      return NextResponse.json({ factor_id: e.id, qr_code: e.totp.qr_code, secret: e.totp.secret, uri: e.totp.uri })
    }

    if (action === 'mfa-verify') {
      const factorId = String(body.factor_id || '')
      const code = String(body.code || '').replace(/\s+/g, '')
      if (!factorId || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Digite o código de 6 dígitos do app.' }, { status: 400 })
      const ch = await gotrue.challenge(tk, factorId)
      let v
      try { v = await gotrue.verify(tk, factorId, ch.id, code) } catch (e: any) {
        return NextResponse.json({ error: 'Código inválido ou expirado. Tente o próximo código do app.' }, { status: 400 })
      }
      await audit(orgId, userId, auth.user.email, 'security.mfa_enabled', { factor: factorId }, request)
      // A verificação devolve uma sessão aal2 — trocamos os cookies para ela.
      const res = NextResponse.json({ ok: true })
      if (v?.access_token) {
        res.cookies.set('sb-access-token', v.access_token, cookieOpts(60 * 60 * 24 * 7))
        if (v.refresh_token) res.cookies.set('sb-refresh-token', v.refresh_token, cookieOpts(60 * 60 * 24 * 30))
        await supabaseAdmin.from('user_sessions').update({ auth_session_id: jwtSessionId(v.access_token) }).eq('auth_session_id', jwtSessionId(tk)).then(() => {}, () => {})
      }
      return res
    }

    if (action === 'mfa-disable') {
      const factorId = String(body.factor_id || '')
      if (!factorId) return NextResponse.json({ error: 'factor_id é obrigatório' }, { status: 400 })
      const password = String(body.password || '')
      if (!password) return NextResponse.json({ error: 'Confirme sua senha para desativar a verificação em duas etapas.' }, { status: 400 })
      const { error: pwErr } = await supabaseAdmin.auth.signInWithPassword({ email: auth.user.email, password })
      if (pwErr) return NextResponse.json({ error: 'Senha incorreta.' }, { status: 400 })
      const { data: org } = await supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single()
      if ((org?.settings as any)?.require_2fa && auth.user.role !== 'owner') {
        return NextResponse.json({ error: 'Sua organização exige verificação em duas etapas. Peça ao proprietário para desligar a exigência primeiro.' }, { status: 400 })
      }
      const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: factorId, userId })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await audit(orgId, userId, auth.user.email, 'security.mfa_disabled', { factor: factorId }, request)
      return NextResponse.json({ ok: true })
    }

    if (action === 'require-2fa') {
      if (!canRoleAccess(auth.user.role, 'org:settings:edit')) return NextResponse.json({ error: 'Só administradores alteram esta regra.' }, { status: 403 })
      const enabled = !!body.enabled
      if (enabled) {
        // Quem liga a exigência precisa já ter 2FA — senão perderia o próprio acesso.
        const { data: factors } = await supabaseAdmin.rpc('list_mfa_factors', { p_user_id: userId })
        if (!((factors as any[]) || []).some((f) => f.status === 'verified')) {
          return NextResponse.json({ error: 'Ative a verificação em duas etapas na sua conta antes de exigir da equipe.' }, { status: 400 })
        }
      }
      const { data: org } = await supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single()
      const settings = { ...(org?.settings || {}), require_2fa: enabled, require_2fa_since: enabled ? new Date().toISOString() : null }
      const { error } = await supabaseAdmin.from('organizations').update({ settings, updated_at: new Date().toISOString() }).eq('id', orgId)
      if (error) throw error
      await audit(orgId, userId, auth.user.email, enabled ? 'security.require_2fa_on' : 'security.require_2fa_off', {}, request)
      return NextResponse.json({ ok: true, require_2fa: enabled })
    }

    if (action === 'revoke-session') {
      const id = String(body.id || '')
      if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
      if (id === jwtSessionId(tk)) return NextResponse.json({ error: 'Para encerrar esta sessão, saia da conta.' }, { status: 400 })
      const { data, error } = await supabaseAdmin.rpc('revoke_auth_session', { p_session_id: id, p_user_id: userId })
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Sessão não encontrada (talvez já tenha sido encerrada).' }, { status: 404 })
      await audit(orgId, userId, auth.user.email, 'security.session_revoked', { session: id }, request)
      return NextResponse.json({ ok: true })
    }

    if (action === 'revoke-others') {
      const { data, error } = await supabaseAdmin.rpc('revoke_other_auth_sessions', { p_user_id: userId, p_keep_session_id: jwtSessionId(tk) })
      if (error) throw error
      await audit(orgId, userId, auth.user.email, 'security.sessions_revoked_all', { count: data }, request)
      return NextResponse.json({ ok: true, count: data || 0 })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status && e.status < 500 ? 400 : 500 })
  }
}

async function audit(orgId: string, userId: string, email: string, action: string, details: any, req: Request) {
  try {
    const m = requestMeta(req)
    await supabaseAdmin.from('audit_logs').insert({ organization_id: orgId, user_id: userId, user_email: email, action, details, ip_address: m.ip, user_agent: m.userAgent })
  } catch { /* nunca derruba a ação */ }
}

// Configurações → Equipe e permissões.
//
// GET    → membros (nome, e-mail, papel, status, último acesso) + quem sou eu
// POST   → { email, role, name? } convida (e-mail com link para criar a senha)
//          { id, resend: true } reenvia o convite
// PATCH  → { id, role } muda o papel
// DELETE → { id } remove (ou cancela o convite)

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { canRoleAccess } from '@/lib/auth/permissions'
import { ASSIGNABLE_ROLES, roleLabel } from '@/lib/settings/roles'
import { requestMeta } from '@/lib/settings/request-meta'
export const dynamic = 'force-dynamic'

// `owner` nunca pode ser atribuído por aqui.
const VALID_ROLES = ASSIGNABLE_ROLES.map((r) => r.value) as string[]
const LEGACY: Record<string, string> = { editor: 'member', viewer: 'analyst' }

function normRole(r: any): string | null {
  const v = LEGACY[String(r || '')] || String(r || '')
  return VALID_ROLES.includes(v) ? v : null
}

function appUrl(req: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, '')
}

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ members: [], me: null })
  const orgId = auth.user.organization_id
  try {
    const [{ data: rows }, { data: org }] = await Promise.all([
      supabaseAdmin.from('organization_members')
        .select('id, user_id, role, email, status, name, invited_at, joined_at, created_at, profiles:user_id(full_name, first_name, last_name, avatar_url, last_seen_at, email, preferences)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single(),
    ])
    // Fatores 2FA verificados por usuário (para "Exigir 2FA para toda a equipe").
    const userIds = (rows || []).map((r: any) => r.user_id).filter(Boolean)
    let mfa: Record<string, boolean> = {}
    if (userIds.length) {
      const { data: f } = await supabaseAdmin.rpc('list_verified_mfa_users', { p_user_ids: userIds })
      for (const u of (f as any[]) || []) mfa[u.user_id] = true
    }
    const members = (rows || []).map((r: any) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      const name = p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || r.name || ''
      return {
        id: r.id,
        user_id: r.user_id,
        email: r.email || p?.email || '',
        name,
        avatar_url: p?.avatar_url || null,
        role: r.role,
        role_label: roleLabel(r.role),
        status: r.user_id && r.status !== 'invited' ? 'active' : 'invited',
        invited_at: r.invited_at || r.created_at,
        joined_at: r.joined_at,
        last_seen_at: p?.last_seen_at || null,
        mfa_enabled: r.user_id ? !!mfa[r.user_id] : null,
        is_me: r.user_id === auth.user.id,
      }
    })
    return NextResponse.json({
      members,
      me: { id: auth.user.id, role: auth.user.role || null },
      require_2fa: !!(org?.settings as any)?.require_2fa,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  if (!canRoleAccess(auth.user.role, 'org:members:invite')) return NextResponse.json({ error: 'Só administradores convidam pessoas.' }, { status: 403 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  try {
    // Reenviar convite
    if (body.id && body.resend) {
      const { data: m } = await supabaseAdmin.from('organization_members').select('id, email, role, name, user_id').eq('id', body.id).eq('organization_id', orgId).maybeSingle()
      if (!m) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
      if (m.user_id) return NextResponse.json({ error: 'Esta pessoa já aceitou o convite.' }, { status: 400 })
      await sendInvite(request, orgId, m.email, m.role, m.name, auth.user.email)
      await supabaseAdmin.from('organization_members').update({ invited_at: new Date().toISOString() }).eq('id', m.id)
      return NextResponse.json({ ok: true })
    }

    const email = String(body.email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    const role = normRole(body.role || 'member')
    if (!role) return NextResponse.json({ error: 'Função inválida.' }, { status: 400 })
    const name = String(body.name || '').trim() || null

    const { data: existing } = await supabaseAdmin.from('organization_members').select('id, user_id').eq('organization_id', orgId).ilike('email', email).maybeSingle()
    if (existing?.user_id) return NextResponse.json({ error: 'Esta pessoa já faz parte da equipe.' }, { status: 409 })

    // Já tem conta Worder em outra organização? Não dá para mover por convite.
    const { data: prof } = await supabaseAdmin.from('profiles').select('id, organization_id').ilike('email', email).maybeSingle()
    if (prof && prof.organization_id && prof.organization_id !== orgId) {
      return NextResponse.json({ error: 'Este e-mail já tem uma conta Worder em outra organização. Peça para usar outro e-mail.' }, { status: 409 })
    }

    let row: any
    if (existing) {
      const { data, error } = await supabaseAdmin.from('organization_members').update({ role, name, status: 'invited', invited_at: new Date().toISOString(), invited_by: auth.user.id }).eq('id', existing.id).select().single()
      if (error) throw error
      row = data
    } else {
      const { data, error } = await supabaseAdmin.from('organization_members').insert({ organization_id: orgId, email, role, name, status: 'invited', invited_at: new Date().toISOString(), invited_by: auth.user.id }).select().single()
      if (error) throw error
      row = data
    }

    // Já tem perfil na MESMA org (ex.: criado à mão) → vincula direto.
    if (prof && prof.organization_id === orgId) {
      await supabaseAdmin.from('organization_members').update({ user_id: prof.id, status: 'active', joined_at: new Date().toISOString() }).eq('id', row.id)
      await supabaseAdmin.from('profiles').update({ role }).eq('id', prof.id)
      return NextResponse.json({ ...row, user_id: prof.id, status: 'active' })
    }

    try {
      await sendInvite(request, orgId, email, role, name, auth.user.email)
    } catch (e: any) {
      await supabaseAdmin.from('organization_members').delete().eq('id', row.id).is('user_id', null)
      return NextResponse.json({ error: `Não foi possível enviar o convite: ${e.message}` }, { status: 502 })
    }
    await audit(orgId, auth.user.id, auth.user.email, 'team.invited', { email, role }, request)
    return NextResponse.json(row)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  if (!canRoleAccess(auth.user.role, 'org:members:role:change')) return NextResponse.json({ error: 'Só administradores alteram funções.' }, { status: 403 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  const { id } = body || {}
  const role = normRole(body.role)
  if (!id || !role) return NextResponse.json({ error: 'id e role válidos são obrigatórios' }, { status: 400 })
  try {
    const { data: member } = await supabaseAdmin.from('organization_members').select('id, role, user_id').eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    if (member.role === 'owner') return NextResponse.json({ error: 'O proprietário não pode ter a função alterada.' }, { status: 400 })
    if (member.user_id === auth.user.id) return NextResponse.json({ error: 'Você não pode alterar a sua própria função.' }, { status: 400 })
    if (member.role === 'admin' && role !== 'admin') {
      const { count } = await supabaseAdmin.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('role', ['admin', 'owner'])
      if ((count || 0) <= 1) return NextResponse.json({ error: 'A organização precisa de pelo menos um administrador' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin.from('organization_members').update({ role }).eq('id', id).eq('organization_id', orgId).select().single()
    if (error) throw error
    if (member.user_id) await supabaseAdmin.from('profiles').update({ role }).eq('id', member.user_id).eq('organization_id', orgId)
    await audit(orgId, auth.user.id, auth.user.email, 'team.role_changed', { member: id, role }, request)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  if (!canRoleAccess(auth.user.role, 'org:members:remove')) return NextResponse.json({ error: 'Só administradores removem pessoas.' }, { status: 403 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  const { id } = body || {}
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  try {
    const { data: member } = await supabaseAdmin.from('organization_members').select('id, role, user_id, email').eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    if (member.role === 'owner') return NextResponse.json({ error: 'O proprietário não pode ser removido.' }, { status: 400 })
    if (member.user_id === auth.user.id) return NextResponse.json({ error: 'Você não pode remover a si mesmo.' }, { status: 400 })
    if (member.role === 'admin') {
      const { count } = await supabaseAdmin.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('role', ['admin', 'owner'])
      if ((count || 0) <= 1) return NextResponse.json({ error: 'Não é possível remover o último administrador' }, { status: 400 })
    }
    const { error } = await supabaseAdmin.from('organization_members').delete().eq('id', id).eq('organization_id', orgId)
    if (error) throw error
    if (member.user_id) {
      // Derruba as sessões de quem saiu (o acesso termina na hora).
      await supabaseAdmin.rpc('revoke_other_auth_sessions', { p_user_id: member.user_id, p_keep_session_id: null }).then(() => {}, () => {})
      await supabaseAdmin.from('profiles').update({ role: 'agent' }).eq('id', member.user_id).eq('organization_id', orgId)
    }
    await audit(orgId, auth.user.id, auth.user.email, 'team.removed', { member: id, email: member.email }, request)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function sendInvite(req: Request, orgId: string, email: string, role: string, name: string | null, invitedBy: string) {
  const { data: org } = await supabaseAdmin.from('organizations').select('name, company_name').eq('id', orgId).single()
  const orgName = org?.company_name || org?.name || 'sua equipe'
  const redirectTo = `${appUrl(req)}/reset-password?invite=1`
  const meta = { invited_org_id: orgId, invited_role: role, full_name: name || undefined, first_name: name ? name.split(' ')[0] : undefined }

  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'invite', email, options: { data: meta, redirectTo } })
  if (error) {
    // Usuário já existe no auth (ex.: convite anterior) → link de recuperação leva à mesma tela de senha.
    if (/already|exists|registered/i.test(error.message)) {
      const { data: l2, error: e2 } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
      if (e2) throw new Error(e2.message)
      return deliver(email, orgName, roleLabel(role), invitedBy, l2.properties.action_link)
    }
    throw new Error(error.message)
  }
  return deliver(email, orgName, roleLabel(role), invitedBy, link.properties.action_link)
}

async function deliver(email: string, orgName: string, role: string, invitedBy: string, url: string) {
  if (!process.env.RESEND_API_KEY) {
    // Sem Resend: o próprio Supabase envia o convite padrão.
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
    if (error && !/already|exists|registered/i.test(error.message)) throw new Error(error.message)
    return
  }
  const { sendEmail } = await import('@/lib/email/resend')
  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Helvetica,Arial,sans-serif;color:#0F1114">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #E8EAEE;border-radius:12px;padding:32px">
    <p style="margin:0 0 6px;font-size:13px;color:#7E8792">Worder</p>
    <h1 style="margin:0 0 12px;font-size:20px">Você foi convidado para ${escapeHtml(orgName)}</h1>
    <p style="font-size:14px;line-height:1.6;color:#525A64">${escapeHtml(invitedBy)} convidou você para entrar na equipe de <b>${escapeHtml(orgName)}</b> no Worder como <b>${escapeHtml(role)}</b>. Crie sua senha para começar.</p>
    <p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#FE5A1D;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Aceitar convite</a></p>
    <p style="font-size:12px;color:#7E8792">Se você não esperava este convite, ignore este e-mail. O link expira em 24 horas.</p>
  </div></body></html>`
  await sendEmail({ to: email, from: process.env.RESEND_FROM_EMAIL || 'noreply@worder.email', senderName: 'Worder', subject: `Convite para ${orgName} no Worder`, html, tags: [{ name: 'type', value: 'team_invite' }] })
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

async function audit(orgId: string, userId: string, email: string, action: string, details: any, req: Request) {
  try {
    const m = requestMeta(req)
    await supabaseAdmin.from('audit_logs').insert({ organization_id: orgId, user_id: userId, user_email: email, action, details, ip_address: m.ip, user_agent: m.userAgent })
  } catch { /* nunca derruba a ação */ }
}

// Configurações → Perfil e Organização.
//
// GET   → perfil (nome, e-mail, telefone, foto, preferências), organização
//         (empresa, CNPJ, endereço, site, moeda) e lojas conectadas.
// PATCH → { type: 'profile' | 'preferences' | 'organization' | 'email' | 'delete-organization', ... }

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { requestMeta } from '@/lib/settings/request-meta'
export const dynamic = 'force-dynamic'

const LOCALES = ['pt-BR', 'en-US', 'es'] as const
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const
const TIME_FORMATS = ['24h', '12h'] as const
const THEMES = ['light', 'dark', 'system'] as const

function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') }
}

const onlyDigits = (v: string) => (v || '').replace(/\D+/g, '')

function validCnpj(v: string): boolean {
  const d = onlyDigits(v)
  if (!d) return true
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (base: string, w: number[]) => {
    const s = base.split('').reduce((acc, ch, i) => acc + Number(ch) * w[i], 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, ...w1]
  const d1 = calc(d.slice(0, 12), w1)
  const d2 = calc(d.slice(0, 12) + d1, w2)
  return d.endsWith(`${d1}${d2}`)
}

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ profile: null, organization: null, stores: [] })
  const userId = auth.user.id
  const orgId = auth.user.organization_id
  try {
    const [{ data: profile }, { data: organization }, { data: stores }, { count: membersCount }] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, email, first_name, last_name, full_name, avatar_url, phone, role, timezone, preferences, created_at').eq('id', userId).single(),
      supabaseAdmin.from('organizations').select('id, name, company_name, cnpj, address, city, state, settings, logo_url, billing_email, created_at').eq('id', orgId).single(),
      supabaseAdmin.from('shopify_stores').select('id, shop_name, shop_domain, primary_domain, is_active, status, connection_status, last_sync_at, connection_type, currency').eq('organization_id', orgId).eq('is_active', true).order('created_at', { ascending: true }),
      supabaseAdmin.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ])
    const s = (organization?.settings || {}) as Record<string, any>
    const fullName = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || ''
    return NextResponse.json({
      profile: profile ? {
        id: profile.id,
        email: profile.email || auth.user.email,
        full_name: fullName,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone || '',
        avatar_url: profile.avatar_url,
        role: profile.role,
        created_at: profile.created_at,
        preferences: {
          locale: profile.preferences?.locale || 'pt-BR',
          timezone: profile.preferences?.timezone || profile.timezone || 'America/Sao_Paulo',
          date_format: profile.preferences?.date_format || 'DD/MM/YYYY',
          time_format: profile.preferences?.time_format || '24h',
          theme: profile.preferences?.theme || 'light',
        },
      } : null,
      organization: organization ? {
        id: organization.id,
        name: organization.name,
        company_name: organization.company_name || organization.name || '',
        cnpj: organization.cnpj || '',
        address: organization.address || '',
        city: organization.city || '',
        state: organization.state || '',
        zip: s.zip || '',
        website: s.website || '',
        default_currency: s.default_currency || 'BRL',
        logo_url: organization.logo_url,
        billing_email: organization.billing_email,
        created_at: organization.created_at,
        delete_requested_at: s.delete_requested_at || null,
        members_count: membersCount ?? null,
      } : null,
      stores: (stores || []).map((st: any) => ({
        id: st.id,
        name: st.shop_name || st.shop_domain,
        domain: st.primary_domain || st.shop_domain,
        platform: st.connection_type === 'manual' ? 'Manual' : 'Shopify',
        status: st.connection_status || st.status,
        last_sync_at: st.last_sync_at,
        currency: st.currency,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const userId = auth.user.id
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  const { type } = body || {}
  try {
    if (type === 'profile') {
      const full = String(body.full_name ?? body.name ?? '').trim()
      if (full.length < 2) return NextResponse.json({ error: 'Informe seu nome completo.' }, { status: 400 })
      const phone = String(body.phone ?? '').trim()
      if (phone && onlyDigits(phone).length < 8) return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
      const { first_name, last_name } = splitName(full)
      const { error } = await supabaseAdmin.from('profiles')
        .update({ full_name: full, first_name, last_name, phone: phone || null, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (error) throw error
      await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { full_name: full, first_name, last_name, name: full } }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (type === 'preferences') {
      const p = body.preferences || {}
      const { data: cur } = await supabaseAdmin.from('profiles').select('preferences').eq('id', userId).single()
      const next: Record<string, any> = { ...(cur?.preferences || {}) }
      if (p.locale !== undefined) { if (!LOCALES.includes(p.locale)) return NextResponse.json({ error: 'Idioma inválido.' }, { status: 400 }); next.locale = p.locale }
      if (p.timezone !== undefined) {
        try { new Intl.DateTimeFormat('pt-BR', { timeZone: p.timezone }) } catch { return NextResponse.json({ error: 'Fuso horário inválido.' }, { status: 400 }) }
        next.timezone = p.timezone
      }
      if (p.date_format !== undefined) { if (!DATE_FORMATS.includes(p.date_format)) return NextResponse.json({ error: 'Formato de data inválido.' }, { status: 400 }); next.date_format = p.date_format }
      if (p.time_format !== undefined) { if (!TIME_FORMATS.includes(p.time_format)) return NextResponse.json({ error: 'Formato de hora inválido.' }, { status: 400 }); next.time_format = p.time_format }
      if (p.theme !== undefined) { if (!THEMES.includes(p.theme)) return NextResponse.json({ error: 'Tema inválido.' }, { status: 400 }); next.theme = p.theme }
      const upd: Record<string, any> = { preferences: next, updated_at: new Date().toISOString() }
      if (next.timezone) upd.timezone = next.timezone
      const { error } = await supabaseAdmin.from('profiles').update(upd).eq('id', userId)
      if (error) throw error
      return NextResponse.json({ ok: true, preferences: next })
    }

    if (type === 'email') {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
      if (email === (auth.user.email || '').toLowerCase()) return NextResponse.json({ error: 'Este já é o seu e-mail.' }, { status: 400 })
      if (!password) return NextResponse.json({ error: 'Confirme sua senha atual.' }, { status: 400 })
      // Confirma a senha antes de trocar o e-mail de login.
      const { error: pwErr } = await supabaseAdmin.auth.signInWithPassword({ email: auth.user.email, password })
      if (pwErr) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: true })
      if (error) {
        const msg = /already|exists|registered/i.test(error.message) ? 'Já existe uma conta com este e-mail.' : error.message
        return NextResponse.json({ error: msg }, { status: 400 })
      }
      await supabaseAdmin.from('profiles').update({ email, updated_at: new Date().toISOString() }).eq('id', userId)
      await supabaseAdmin.from('organization_members').update({ email }).eq('user_id', userId)
      await audit(orgId, userId, auth.user.email, 'account.email_changed', { from: auth.user.email, to: email }, request)
      return NextResponse.json({ ok: true, email })
    }

    if (type === 'organization') {
      const company_name = String(body.company_name ?? '').trim()
      if (company_name.length < 2) return NextResponse.json({ error: 'Informe o nome da empresa.' }, { status: 400 })
      const cnpj = String(body.cnpj ?? '').trim()
      if (!validCnpj(cnpj)) return NextResponse.json({ error: 'CNPJ inválido.' }, { status: 400 })
      let website = String(body.website ?? '').trim()
      if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`
      if (website) { try { new URL(website) } catch { return NextResponse.json({ error: 'Site inválido.' }, { status: 400 }) } }
      const default_currency = String(body.default_currency || 'BRL').toUpperCase()
      if (!/^[A-Z]{3}$/.test(default_currency)) return NextResponse.json({ error: 'Moeda inválida.' }, { status: 400 })
      const { data: cur } = await supabaseAdmin.from('organizations').select('settings, name').eq('id', orgId).single()
      const settings = { ...(cur?.settings || {}), zip: String(body.zip ?? '').trim(), website, default_currency }
      const { error } = await supabaseAdmin.from('organizations').update({
        company_name,
        name: cur?.name || company_name,
        cnpj: cnpj || null,
        address: String(body.address ?? '').trim() || null,
        city: String(body.city ?? '').trim() || null,
        state: String(body.state ?? '').trim() || null,
        settings,
        updated_at: new Date().toISOString(),
      }).eq('id', orgId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (type === 'delete-organization') {
      // Só o dono pode pedir; a exclusão é executada pelo suporte após confirmação,
      // como Klaviyo/Omnisend fazem (evita apagar tudo por um clique errado).
      if (auth.user.role !== 'owner' && auth.user.role !== 'admin') return NextResponse.json({ error: 'Só o proprietário pode excluir a organização.' }, { status: 403 })
      const confirm = String(body.confirm || '')
      const { data: org } = await supabaseAdmin.from('organizations').select('name, company_name, settings').eq('id', orgId).single()
      const expected = (org?.company_name || org?.name || '').trim()
      if (!expected || confirm.trim() !== expected) return NextResponse.json({ error: `Digite exatamente “${expected}” para confirmar.` }, { status: 400 })
      const settings = { ...(org?.settings || {}), delete_requested_at: new Date().toISOString(), delete_requested_by: userId, delete_reason: String(body.reason || '').slice(0, 500) }
      const { error } = await supabaseAdmin.from('organizations').update({ settings, updated_at: new Date().toISOString() }).eq('id', orgId)
      if (error) throw error
      await audit(orgId, userId, auth.user.email, 'organization.delete_requested', { reason: settings.delete_reason }, request)
      notifySupport(`Pedido de exclusão de organização: ${expected} (${orgId})`, `<p>Usuário ${auth.user.email} pediu a exclusão da organização <b>${expected}</b> (${orgId}).</p><p>Motivo: ${settings.delete_reason || '—'}</p>`)
      return NextResponse.json({ ok: true, delete_requested_at: settings.delete_requested_at })
    }

    if (type === 'cancel-delete-organization') {
      const { data: org } = await supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single()
      const settings = { ...(org?.settings || {}) }
      delete settings.delete_requested_at; delete settings.delete_requested_by; delete settings.delete_reason
      const { error } = await supabaseAdmin.from('organizations').update({ settings, updated_at: new Date().toISOString() }).eq('id', orgId)
      if (error) throw error
      await audit(orgId, userId, auth.user.email, 'organization.delete_cancelled', {}, request)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function audit(orgId: string, userId: string, email: string, action: string, details: any, req: Request) {
  try {
    const m = requestMeta(req)
    await supabaseAdmin.from('audit_logs').insert({ organization_id: orgId, user_id: userId, user_email: email, action, details, ip_address: m.ip, user_agent: m.userAgent })
  } catch { /* auditoria nunca derruba a ação */ }
}

function notifySupport(subject: string, html: string) {
  const to = process.env.SUPPORT_EMAIL || process.env.RESEND_FROM_EMAIL
  if (!to || !process.env.RESEND_API_KEY) return
  import('@/lib/email/resend').then(({ sendEmail }) =>
    sendEmail({ to, from: process.env.RESEND_FROM_EMAIL || 'noreply@worder.email', senderName: 'Worder', subject, html }).catch(() => {})
  ).catch(() => {})
}

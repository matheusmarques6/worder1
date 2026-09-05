// Configurações → Privacidade e LGPD.
// GET   → consentimento (double opt-in padrão, DPO), retenção (políticas do
//         cron lgpd-retention), pedidos de titulares e consentimentos.
// PATCH → { consent?: { double_opt_in, dpo_email }, retention?: { contacts_months, events_months } }

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic'

const MONTHS_TO_DAYS = (m: number) => Math.round(m * 30.4375)
const DAYS_TO_MONTHS = (d: number) => Math.round(d / 30.4375)

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  try {
    const [{ data: org }, { data: policies }, { data: requests }, { data: consents }, { count: consentCount }] = await Promise.all([
      supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single(),
      supabaseAdmin.from('lgpd_retention_policies').select('resource, retention_days, enabled, anonymize_only').eq('organization_id', orgId),
      supabaseAdmin.from('lgpd_data_requests').select('id, requester_email, request_type, status, created_at, verified_at, processed_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('lgpd_consents').select('id, consent_type, granted, source, granted_at, revoked_at, contact_id').eq('organization_id', orgId).order('granted_at', { ascending: false }).limit(50),
      supabaseAdmin.from('lgpd_consents').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ])
    const privacy = (org?.settings as any)?.privacy || {}
    const pol = (r: string) => (policies || []).find((p: any) => p.resource === r && p.enabled)
    const contacts = pol('contacts_inactive')
    const events = pol('contact_events')
    return NextResponse.json({
      consent: {
        double_opt_in: !!privacy.double_opt_in,
        dpo_email: privacy.dpo_email || '',
      },
      retention: {
        contacts_months: contacts ? DAYS_TO_MONTHS(contacts.retention_days) : null,
        events_months: events ? DAYS_TO_MONTHS(events.retention_days) : null,
      },
      requests: requests || [],
      consents: consents || [],
      consents_total: consentCount || 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  try {
    if (body.consent) {
      const dpo = String(body.consent.dpo_email || '').trim().toLowerCase()
      if (dpo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dpo)) return NextResponse.json({ error: 'E-mail do encarregado inválido.' }, { status: 400 })
      const { data: org } = await supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single()
      const settings = { ...(org?.settings || {}), privacy: { ...((org?.settings as any)?.privacy || {}), double_opt_in: !!body.consent.double_opt_in, dpo_email: dpo } }
      const { error } = await supabaseAdmin.from('organizations').update({ settings, updated_at: new Date().toISOString() }).eq('id', orgId)
      if (error) throw error
    }
    if (body.retention) {
      const upsert = async (resource: string, months: any, anonymize_only: boolean) => {
        const m = months === null || months === undefined || months === '' ? null : Number(months)
        if (m === null) {
          await supabaseAdmin.from('lgpd_retention_policies').delete().eq('organization_id', orgId).eq('resource', resource)
          return
        }
        if (!Number.isFinite(m) || m < 1 || m > 120) throw new Error('Período de retenção inválido (1 a 120 meses).')
        const { error } = await supabaseAdmin.from('lgpd_retention_policies').upsert({ organization_id: orgId, resource, retention_days: MONTHS_TO_DAYS(m), enabled: true, anonymize_only, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,resource' })
        if (error) throw error
      }
      if ('contacts_months' in body.retention) await upsert('contacts_inactive', body.retention.contacts_months, true)
      if ('events_months' in body.retention) {
        await upsert('contact_events', body.retention.events_months, true)
        await upsert('email_sends', body.retention.events_months, true)
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message?.includes('inválido') ? 400 : 500 })
  }
}

// =============================================
// WORDER: Process LGPD data request
// POST /api/lgpd/data-requests/[id]/process
//
// Executa o pedido:
// - export: coleta todos os dados do contato e envia por email
// - delete: anonimiza contato + eventos + envia confirmação
// - rectification: aplica payload.updates no contato
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  // Chamada interna ou manual admin via CRON_SECRET
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return auth === `Bearer ${secret}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: request } = await supabaseAdmin
    .from('lgpd_data_requests')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (!request) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!request.verified_at) {
    return NextResponse.json({ error: 'Not verified' }, { status: 400 })
  }
  if (request.status === 'completed') {
    return NextResponse.json({ message: 'Already completed' })
  }

  try {
    let response: any = {}

    switch (request.request_type) {
      case 'export':
      case 'portability':
        response = await exportData(request)
        break
      case 'delete':
        response = await deleteData(request)
        break
      case 'rectification':
        response = await rectifyData(request)
        break
      case 'object':
      case 'restrict':
        response = await restrictProcessing(request)
        break
      default:
        response = { error: 'Unsupported type' }
    }

    await supabaseAdmin
      .from('lgpd_data_requests')
      .update({
        status: 'completed',
        response,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)

    // Notifica o requisitante via email
    try {
      const { sendEmail } = await import('@/lib/email/resend')
      const from = process.env.LGPD_FROM_EMAIL || 'privacy@worder.app'
      await sendEmail({
        to: request.requester_email,
        from,
        subject: `Seu pedido LGPD de ${request.request_type} foi processado`,
        html: `<p>Seu pedido foi concluído.</p><pre>${JSON.stringify(response, null, 2).slice(0, 2000)}</pre>`,
      })
    } catch { /* silent */ }

    return NextResponse.json({ success: true, response })
  } catch (err: any) {
    await supabaseAdmin
      .from('lgpd_data_requests')
      .update({
        status: 'rejected',
        response: { error: err?.message },
        processed_at: new Date().toISOString(),
      })
      .eq('id', request.id)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

// ---------- actions ----------

async function exportData(request: any) {
  if (!request.contact_id) return { error: 'No contact linked' }

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', request.contact_id)
    .maybeSingle()

  const { data: events } = await supabaseAdmin
    .from('contact_events')
    .select('event_type, occurred_at, properties')
    .eq('organization_id', request.organization_id)
    .eq('contact_id', request.contact_id)
    .order('occurred_at', { ascending: false })
    .limit(5000)

  const { data: orders } = await supabaseAdmin
    .from('shopify_orders')
    .select('shopify_order_number, total_price, currency, financial_status, shopify_created_at')
    .eq('organization_id', request.organization_id)
    .eq('contact_id', request.contact_id)

  const { data: consents } = await supabaseAdmin
    .from('lgpd_consents')
    .select('consent_type, granted, granted_at, revoked_at, source')
    .eq('contact_id', request.contact_id)

  return {
    contact,
    events: events || [],
    orders: orders || [],
    consents: consents || [],
    exported_at: new Date().toISOString(),
  }
}

async function deleteData(request: any) {
  if (!request.contact_id) return { error: 'No contact linked' }

  // Anonimizar em vez de hard-delete (mantém integridade referencial)
  const anonId = `lgpd_deleted_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await supabaseAdmin
    .from('contacts')
    .update({
      email: `${anonId}@deleted.lgpd`,
      phone: null,
      whatsapp: null,
      first_name: 'Apagado',
      last_name: 'LGPD',
      full_name: 'Apagado LGPD',
      is_active: false,
      status: 'deleted_lgpd',
      email_consent: false,
      sms_consent: false,
      whatsapp_consent: false,
      custom_fields: {},
      shopify_customer_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.contact_id)

  // Limpar eventos com PII
  await supabaseAdmin
    .from('contact_events')
    .update({
      properties: {},
    })
    .eq('contact_id', request.contact_id)

  return { deleted: true, anonymized_id: request.contact_id }
}

async function rectifyData(request: any) {
  if (!request.contact_id || !request.payload?.updates) {
    return { error: 'No contact or updates' }
  }
  const allowed = ['first_name', 'last_name', 'full_name', 'email', 'phone', 'city', 'state', 'country']
  const updates: Record<string, any> = {}
  for (const k of allowed) {
    if (request.payload.updates[k] !== undefined) updates[k] = request.payload.updates[k]
  }
  if (Object.keys(updates).length === 0) return { error: 'No valid fields' }

  await supabaseAdmin
    .from('contacts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', request.contact_id)
    .eq('organization_id', request.organization_id)

  return { rectified: true, fields: Object.keys(updates) }
}

async function restrictProcessing(request: any) {
  if (!request.contact_id) return { error: 'No contact linked' }
  await supabaseAdmin
    .from('contacts')
    .update({
      email_consent: false,
      sms_consent: false,
      whatsapp_consent: false,
      status: 'processing_restricted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.contact_id)
  return { restricted: true }
}

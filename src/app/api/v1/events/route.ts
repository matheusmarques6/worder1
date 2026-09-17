// API pública v1 — Eventos.
// POST /api/v1/events { event: 'placed_order', email|phone|contact_id, properties{}, value?, currency?, occurred_at?, store_id? }
// Permissão: events:write. Eventos entram na linha do tempo e disparam automações.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { authenticateApiKey } from '@/lib/auth/api-key'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const a = await authenticateApiKey(req, 'events:write')
  if ('error' in a) return a.error
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  const list: any[] = Array.isArray(body.events) ? body.events : [body]
  if (list.length > 1000) return NextResponse.json({ error: 'too_many', message: 'Máximo de 1.000 eventos por chamada.' }, { status: 400 })
  const orgId = a.ctx.organizationId

  const { createEvent } = await import('@/lib/shopify/event-service')
  const out: any[] = []
  for (const e of list) {
    const type = String(e.event || e.event_type || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!type) { out.push({ error: 'event_required' }); continue }
    let contactId: string | null = e.contact_id || null
    if (!contactId && (e.email || e.phone)) {
      let q = supabaseAdmin.from('contacts').select('id').eq('organization_id', orgId)
      q = e.email ? q.ilike('email', String(e.email).trim()) : q.eq('phone', String(e.phone).replace(/[^\d+]/g, ''))
      const { data } = await q.limit(1).maybeSingle()
      contactId = data?.id || null
      if (!contactId && e.email) {
        const { data: created } = await supabaseAdmin.from('contacts').insert({ organization_id: orgId, email: String(e.email).trim().toLowerCase(), phone: e.phone || null, source: 'api', store_id: e.store_id || null }).select('id').single()
        contactId = created?.id || null
      }
    }
    try {
      const rec = await createEvent({
        organization_id: orgId,
        contact_id: contactId,
        store_id: e.store_id || null,
        event_type: type as any,
        event_source: 'api' as any,
        properties: e.properties && typeof e.properties === 'object' ? e.properties : {},
        monetary_value: e.value != null ? Number(e.value) : null,
        currency: e.currency || undefined,
        occurred_at: e.occurred_at || undefined,
        idempotency_key: e.idempotency_key || null,
      })
      out.push({ id: rec?.id || null, event: type, contact_id: contactId })
    } catch (err: any) {
      out.push({ event: type, error: err?.message || 'failed' })
    }
  }
  return NextResponse.json({ data: out }, { status: 202 })
}

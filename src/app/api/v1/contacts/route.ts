// API pública v1 — Contatos.
// GET  /api/v1/contacts?search=&limit=&cursor=   (contacts:read)
// POST /api/v1/contacts  { email|phone, first_name, last_name, tags[], custom_fields{} } (contacts:write)
//      ou { contacts: [...] } para importar em lote (até 10.000).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { authenticateApiKey, BULK_IMPORT_LIMIT } from '@/lib/auth/api-key'
import { checkEmail } from '@/lib/email/email-hygiene'
export const dynamic = 'force-dynamic'

const FIELDS = 'id, email, phone, first_name, last_name, full_name, tags, custom_fields, source, is_subscribed_email, is_subscribed_sms, total_orders, total_spent, created_at, updated_at'

export async function GET(req: NextRequest) {
  const a = await authenticateApiKey(req, 'contacts:read')
  if ('error' in a) return a.error
  const sp = req.nextUrl.searchParams
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit') || 50)))
  const cursor = sp.get('cursor')
  const search = (sp.get('search') || '').trim()
  let q = supabaseAdmin.from('contacts').select(FIELDS).eq('organization_id', a.ctx.organizationId).order('created_at', { ascending: false }).limit(limit + 1)
  if (cursor) q = q.lt('created_at', cursor)
  if (search) q = q.or(`email.ilike.%${search.replace(/[%,]/g, '')}%,phone.ilike.%${search.replace(/[%,]/g, '')}%`)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'query_failed', message: error.message }, { status: 500 })
  const rows = data || []
  const next = rows.length > limit ? rows[limit - 1].created_at : null
  return NextResponse.json({ data: rows.slice(0, limit), next_cursor: next })
}

export async function POST(req: NextRequest) {
  const a = await authenticateApiKey(req, 'contacts:write')
  if ('error' in a) return a.error
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  const list: any[] = Array.isArray(body.contacts) ? body.contacts : [body]
  if (list.length > BULK_IMPORT_LIMIT) return NextResponse.json({ error: 'too_many', message: `Máximo de ${BULK_IMPORT_LIMIT} contatos por chamada.` }, { status: 400 })

  const orgId = a.ctx.organizationId
  const results: any[] = []
  const rows: any[] = []
  for (const c of list) {
    const email = c.email ? checkEmail(String(c.email), { rejectDisposable: false }) : null
    if (email && !email.ok) { results.push({ email: c.email, error: 'invalid_email' }); continue }
    const phone = c.phone ? String(c.phone).replace(/[^\d+]/g, '') : null
    if (!email && !phone) { results.push({ error: 'email_or_phone_required' }); continue }
    rows.push({
      organization_id: orgId,
      email: email?.normalized || null,
      phone,
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      full_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
      tags: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 50) : [],
      custom_fields: c.custom_fields && typeof c.custom_fields === 'object' ? c.custom_fields : {},
      source: c.source ? String(c.source).slice(0, 40) : 'api',
      store_id: c.store_id || null,
      is_subscribed_email: c.subscribed_email === undefined ? true : !!c.subscribed_email,
      updated_at: new Date().toISOString(),
    })
  }

  let upserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const withEmail = chunk.filter((r) => r.email)
    const withoutEmail = chunk.filter((r) => !r.email)
    if (withEmail.length) {
      const { data, error } = await supabaseAdmin.from('contacts').upsert(withEmail, { onConflict: 'organization_id,email', ignoreDuplicates: false }).select('id, email')
      if (error) return NextResponse.json({ error: 'write_failed', message: error.message, processed: upserted }, { status: 500 })
      upserted += data?.length || 0
      if (list.length === 1 && data?.[0]) return NextResponse.json({ data: data[0] }, { status: 201 })
    }
    if (withoutEmail.length) {
      const { data, error } = await supabaseAdmin.from('contacts').insert(withoutEmail).select('id, phone')
      if (error) return NextResponse.json({ error: 'write_failed', message: error.message, processed: upserted }, { status: 500 })
      upserted += data?.length || 0
      if (list.length === 1 && data?.[0]) return NextResponse.json({ data: data[0] }, { status: 201 })
    }
  }
  return NextResponse.json({ processed: upserted, rejected: results }, { status: 200 })
}

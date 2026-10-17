import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { checked, GRAPH_REVIEW_REQUIRED, LgpdStepError, readSubjectRows } from '@/lib/lgpd/operations'
import { erasePopupData, exportPopupData } from '@/lib/popups/lgpd'
import { suppressWhatsAppForContact } from '@/lib/lgpd/suppression'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (body: any, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

async function saveRequest(request: any, patch: Record<string, any>) {
  const result = await checked(supabaseAdmin.from('lgpd_data_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', request.id).eq('organization_id', request.organization_id).select('id'), 'save_request')
  if (result.data?.length !== 1) throw new LgpdStepError('save_request_count')
}

async function updateContact(request: any, patch: Record<string, any>) {
  const result = await checked(supabaseAdmin.from('contacts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', request.contact_id).eq('organization_id', request.organization_id).select('*'), 'update_contacts')
  if (result.data?.length !== 1) throw new LgpdStepError('update_contacts_count')
  // Returned rows are the postcondition, including trigger-modified values.
  if (Object.entries(patch).some(([key, value]) => JSON.stringify(result.data[0][key]) !== JSON.stringify(value))) {
    throw new LgpdStepError('update_contacts_postcondition')
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let orgScope: string | null = null
  if (!authorizeCronRequest(req)) {
    const auth = await getAuthClient()
    if (!auth || !auth.user.organization_id || !['owner', 'admin'].includes(String(auth.user.role || ''))) {
      return json({ error: 'Unauthorized' }, 401)
    }
    orgScope = auth.user.organization_id
  }

  let request: any = null
  const counts: Record<string, number> = {}
  try {
    const { id } = await params
    let query = supabaseAdmin.from('lgpd_data_requests').select('*').eq('id', id)
    if (orgScope) query = query.eq('organization_id', orgScope)
    const found = await checked(query.maybeSingle(), 'read_request')
    request = found.data
    if (!request) return json({ error: 'Not found' }, 404)
    if (!request.verified_at) return json({ error: 'Not verified' }, 400)
    if (request.status === 'completed') return json({ message: 'Already completed' })
    if (['cancelled', 'rejected'].includes(request.status)) return json({ error: 'Request is closed' }, 409)
    if (!request.contact_id || !request.organization_id) return json({ error: 'Contact required' }, 400)
    const { data: contact } = await checked(supabaseAdmin.from('contacts').select('*')
      .eq('organization_id', request.organization_id).eq('id', request.contact_id).maybeSingle(), 'read_contacts')
    if (!contact) return json({ error: 'Contact not found in organization' }, 404)
    if (!['export', 'portability', 'delete', 'rectification', 'object', 'restrict'].includes(request.request_type)) {
      return json({ error: 'Unsupported request type' }, 400)
    }

    await saveRequest(request, { status: 'processing', processed_at: null, response: { counts, needs_review: true } })
    let response: any
    let needsReview = false
    switch (request.request_type) {
      case 'export':
      case 'portability':
        response = await exportData(request, contact, counts)
        needsReview = true
        break
      case 'delete':
        counts.whatsapp_suppressions = await suppressWhatsAppForContact(supabaseAdmin, request.organization_id, contact)
        response = await deleteData(request, counts)
        needsReview = true
        break
      case 'rectification': {
        const allowed = ['first_name', 'last_name', 'email', 'phone', 'city', 'state', 'country']
        const updates: Record<string, string | null> = {}
        for (const key of allowed) {
          const value = request.payload?.updates?.[key]
          if (value !== undefined) {
            if (value !== null && typeof value !== 'string') throw new LgpdStepError('invalid_rectification')
            updates[key] = value
          }
        }
        if (!Object.keys(updates).length) throw new LgpdStepError('invalid_rectification')
        await updateContact(request, updates)
        counts.contacts = 1
        response = { rectified: true, fields: Object.keys(updates) }
        break
      }
      default:
        counts.whatsapp_suppressions = await suppressWhatsAppForContact(supabaseAdmin, request.organization_id, contact)
        await updateContact(request, restriction)
        counts.contacts = 1
        response = { restricted: true }
    }

    // Persist metadata only. An export is returned to the authorized admin for
    // review, never copied into the request row or notification email.
    const summary = {
      counts, needs_review: needsReview,
      ...(needsReview ? { pending: GRAPH_REVIEW_REQUIRED } : {}),
      ...(request.request_type === 'delete' ? { retained_for_suppression: ['whatsapp_opt_status.phone'] } : {}),
    }
    await saveRequest(request, {
      status: needsReview ? 'processing' : 'completed', response: summary,
      processed_at: needsReview ? null : new Date().toISOString(),
    })
    if (!needsReview) {
      try {
        const { sendEmail } = await import('@/lib/email/resend')
        await sendEmail({
          to: request.requester_email,
          from: process.env.LGPD_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'noreply@worder.email',
          subject: 'Atualização do seu pedido LGPD', html: '<p>Seu pedido foi concluído.</p>',
        })
      } catch { /* Notification delivery does not change the completed data operation. */ }
    }
    return json({ success: !needsReview, ...summary, response }, needsReview ? 202 : 200)
  } catch (error) {
    const stage = error instanceof LgpdStepError ? error.stage : 'unexpected_failure'
    let stateSaved = false
    if (request) {
      try {
        await saveRequest(request, { status: 'processing', processed_at: null, response: { needs_review: true, retryable: true, stage, counts } })
        stateSaved = true
      } catch { /* HTTP failure remains explicit even when the checkpoint cannot be saved. */ }
    }
    return json({ error: 'LGPD processing failed', stage, needs_review: true, state_saved: stateSaved }, 500)
  }
}

const restriction = {
  suppressed: true, email_consent: 'unsubscribed', sms_consent: false, whatsapp_consent: false,
  is_subscribed_email: false, is_subscribed_sms: false, is_subscribed_whatsapp: false,
}

async function exportData(request: any, contact: any, counts: Record<string, number>) {
  const graph: Record<string, any[]> = {}
  const read = async (table: string, column = 'contact_id', value = request.contact_id) => {
    const rows = await readSubjectRows(supabaseAdmin, table, request.organization_id, column, value)
    graph[table] = [...(graph[table] || []), ...rows]
    counts[table] = graph[table].length
    return rows
  }
  for (const table of ['contact_events', 'shopify_orders', 'email_sends', 'lgpd_consents', 'channel_identities']) await read(table)
  const conversations = await read('conversations')
  graph.messages = []; graph.agent_traces = []
  for (const conversation of conversations) {
    await read('messages', 'conversation_id', conversation.id)
    await read('agent_traces', 'conversation_id', conversation.id)
  }
  for (const [contactsTable, conversationsTable, messagesTable] of [
    ['whatsapp_contacts', 'whatsapp_cloud_conversations', 'whatsapp_cloud_messages'],
    ['instagram_contacts', 'instagram_conversations', 'instagram_messages'],
  ]) {
    const contacts = await read(contactsTable, 'crm_contact_id')
    graph[conversationsTable] = []; graph[messagesTable] = []
    for (const channelContact of contacts) {
      const threads = await read(conversationsTable, 'contact_id', channelContact.id)
      for (const thread of threads) await read(messagesTable, 'conversation_id', thread.id)
    }
  }
  const popup = await exportPopupData(supabaseAdmin, request.organization_id, request.contact_id)
  for (const [key, rows] of Object.entries(popup)) counts[`popup_${key}`] = rows.length
  counts.contacts = 1
  return { contact, graph, popup, exported_at: new Date().toISOString(), needs_review: true }
}

async function deleteData(request: any, counts: Record<string, number>) {
  // Keep stable ids for retries and the pending lineage review. This partial
  // scrub does not claim the remaining record is anonymous or unlinkable.
  await updateContact(request, {
    ...restriction, email: `lgpd_deleted_${request.contact_id}@deleted.lgpd`, phone: null, whatsapp: null,
    first_name: 'Apagado', last_name: 'LGPD', company: null, position: null,
    avatar_url: null, profile_picture_url: null, profile_name: null,
    address: {}, birthday: null, gender: null, city: null, state: null, country: null, zip: null,
    custom_fields: {}, tags: [],
  })
  counts.contacts = 1
  const oldExports = await checked(supabaseAdmin.from('lgpd_data_requests')
    .update({ response: { erased_copy: true } }, { count: 'exact' })
    .eq('organization_id', request.organization_id).eq('contact_id', request.contact_id)
    .in('request_type', ['export', 'portability']).select('id'), 'erase_prior_exports')
  counts.lgpd_export_copies = oldExports.count ?? oldExports.data?.length ?? 0
  const events = await checked(supabaseAdmin.from('contact_events')
    .update({ properties: {}, session_id: null, anonymous_id: null }, { count: 'exact' })
    .eq('organization_id', request.organization_id).eq('contact_id', request.contact_id).select('id'), 'erase_contact_events')
  counts.contact_events = events.count ?? events.data?.length ?? 0
  const popup = await erasePopupData(supabaseAdmin, request.organization_id, request.contact_id)
  for (const [key, count] of Object.entries(popup)) counts[`popup_${key}`] = count
  return { partial: true, needs_review: true }
}

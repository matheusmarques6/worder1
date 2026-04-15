import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

/**
 * Endpoint interno chamado pelos redirects de open/click (em edge runtime).
 * Valida que (contactId, campaignId) pertencem ao orgId informado antes de gravar.
 * Retorna 200 mesmo em erro (não quebra pixel/click).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, campaignId, contactId, orgId, url, sendId } = body

    if (!type || !campaignId || !contactId || !orgId) {
      return NextResponse.json({ ok: true })
    }

    // ---- Validação multi-tenant ----
    // A campanha tem que pertencer ao orgId informado
    const { data: campaign } = await supabaseAdmin
      .from('email_campaigns')
      .select('id, organization_id')
      .eq('id', campaignId)
      .maybeSingle()

    if (!campaign || campaign.organization_id !== orgId) {
      // sempre retorna 200 pro pixel, mas não grava
      return NextResponse.json({ ok: true })
    }

    // O contato tem que pertencer ao mesmo org
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, organization_id')
      .eq('id', contactId)
      .maybeSingle()

    if (!contact || contact.organization_id !== orgId) {
      return NextResponse.json({ ok: true })
    }

    const eventType =
      type === 'open' ? 'email_opened' :
      type === 'click' ? 'email_clicked' :
      String(type)

    // ---- Idempotência por campanha+contato+url+dia ----
    // Permite multiple opens por email mas deduplica burst (prefetch do Gmail, etc)
    const dayKey = new Date().toISOString().slice(0, 10)
    const urlKey = url ? url.slice(0, 200) : ''
    const idempotencyKey = `${eventType}:${campaignId}:${contactId}:${dayKey}:${urlKey}`

    // Insert (ignora duplicata via idempotency_key)
    await supabaseAdmin
      .from('contact_events')
      .insert({
        organization_id: orgId,
        contact_id: contactId,
        event_type: eventType,
        event_source: 'worder_email',
        properties: {
          CampaignId: campaignId,
          SendId: sendId || null,
          ...(url ? { ClickedURL: url } : {}),
        },
        occurred_at: new Date().toISOString(),
        idempotency_key: idempotencyKey,
      })
      // ignora erro se idempotency_key já existe
      .select()
      .maybeSingle()

    // Update contact last_active_at
    await supabaseAdmin
      .from('contacts')
      .update({
        last_active_at: new Date().toISOString(),
        last_event_type: eventType,
      })
      .eq('id', contactId)
      .eq('organization_id', orgId)

    // Atualiza email_sends se sendId fornecido (open/click timestamps)
    if (sendId) {
      const updateField =
        type === 'open' ? { opened_at: new Date().toISOString() } :
        type === 'click' ? { clicked_at: new Date().toISOString() } :
        null
      if (updateField) {
        await supabaseAdmin
          .from('email_sends')
          .update(updateField)
          .eq('id', sendId)
          .is(type === 'open' ? 'opened_at' : 'clicked_at', null)
      }
    }

    // Update campaign stats (best-effort)
    if (type === 'open') {
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_opens', {
        campaign_id: campaignId,
      })
      if (rpcErr && !String(rpcErr.message).includes('does not exist')) {
        console.warn('[Email Track] increment_campaign_opens failed:', rpcErr.message)
      }
    } else if (type === 'click') {
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_clicks', {
        campaign_id: campaignId,
      })
      if (rpcErr && !String(rpcErr.message).includes('does not exist')) {
        console.warn('[Email Track] increment_campaign_clicks failed:', rpcErr.message)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[Email Track Record]', error?.message)
    // Pixel/click continuam funcionando mesmo com erro
    return NextResponse.json({ ok: true })
  }
}

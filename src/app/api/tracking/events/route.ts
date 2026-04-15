import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'
export const dynamic = 'force-dynamic';

// =============================================
// API: /api/tracking/events
// Endpoint AUTENTICADO para gravar eventos via painel/integrações internas.
// (Pixel público usa /api/track/event — ver tracking.js)
//
// TABELA: contact_events (fonte única de verdade).
// =============================================

// POST - Registrar evento
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organization_id = auth.user.organization_id

    const body = await request.json()
    const {
      event_type,
      event_source = 'worder_internal',

      // Identificadores
      visitor_id,
      customer_email,
      customer_phone,
      shopify_customer_id,
      contact_id,
      store_id,

      // Produto
      product_id,
      product_name,
      product_price,
      product_quantity,
      product_category,

      // Pedido
      order_id,
      order_total,
      order_items,

      // Sessão
      session_id,
      page_url,
      referrer_url,
      utm_source,
      utm_medium,
      utm_campaign,

      // Extras
      event_data = {},
      idempotency_key,
    } = body

    if (!event_type) {
      return NextResponse.json({ error: 'event_type required' }, { status: 400 })
    }

    // Extrair info do request
    const userAgent = request.headers.get('user-agent') || ''
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') || null

    const device_type = /mobile/i.test(userAgent) ? 'mobile' :
                        /tablet/i.test(userAgent) ? 'tablet' : 'desktop'

    const browser = userAgent.includes('Chrome') ? 'Chrome' :
                    userAgent.includes('Firefox') ? 'Firefox' :
                    userAgent.includes('Safari') ? 'Safari' :
                    userAgent.includes('Edge') ? 'Edge' : 'Other'

    // Tentar encontrar/vincular contato
    let resolvedContactId = contact_id
    if (!resolvedContactId && (customer_email || customer_phone)) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organization_id)
        .or(
          [
            customer_email ? `email.eq.${customer_email}` : '',
            customer_phone ? `phone.eq.${customer_phone}` : '',
            customer_phone ? `whatsapp.eq.${customer_phone}` : '',
          ].filter(Boolean).join(',')
        )
        .limit(1)
        .maybeSingle()

      resolvedContactId = contact?.id
    }

    // Inserir evento em contact_events
    const now = new Date().toISOString()
    const idem =
      idempotency_key ||
      (order_id
        ? `${event_type}:${organization_id}:order:${order_id}`
        : null)

    const { data: event, error } = await supabase
      .from('contact_events')
      .insert({
        organization_id,
        contact_id: resolvedContactId || null,
        store_id: store_id || null,
        visitor_id: visitor_id || null,
        event_type,
        event_source,
        properties: {
          ...event_data,
          customer_email,
          customer_phone,
          order_items,
        },
        product_id,
        product_name,
        product_price,
        product_quantity,
        product_category,
        order_id,
        order_total,
        monetary_value: order_total ?? product_price ?? null,
        currency: 'BRL',
        session_id,
        page_url,
        referrer_url,
        utm_source,
        utm_medium,
        utm_campaign,
        device_type,
        browser,
        ip_address: ip,
        shopify_customer_id,
        occurred_at: now,
        received_at: now,
        idempotency_key: idem,
      })
      .select()
      .single()

    if (error && !String(error.message).includes('duplicate key')) throw error

    // Se for compra, atualizar contato
    if (event_type === 'purchase' && resolvedContactId && order_total) {
      try {
        await supabase.rpc('increment_contact_revenue', {
          p_contact_id: resolvedContactId,
          p_amount: Number(order_total),
        })
      } catch { /* ignore */ }
    }

    // Trigger automações (async)
    if (event) {
      triggerAutomations(event).catch(console.error)
    }

    return NextResponse.json({
      success: true,
      event_id: event?.id || null,
      contact_id: resolvedContactId,
    })
  } catch (error: any) {
    console.error('[Event Tracking] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - Buscar eventos
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organization_id = auth.user.organization_id

    const { searchParams } = new URL(request.url)
    const contact_id = searchParams.get('contact_id')
    const event_type = searchParams.get('event_type')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let query = supabase
      .from('contact_events')
      .select('*', { count: 'exact' })
      .eq('organization_id', organization_id)
      .order('occurred_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (contact_id) query = query.eq('contact_id', contact_id)
    if (event_type) query = query.eq('event_type', event_type)

    const { data, count, error } = await query
    if (error) throw error

    return NextResponse.json({ events: data, total: count })
  } catch (error: any) {
    console.error('[Event Tracking] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// TRIGGER AUTOMAÇÕES (fire-and-forget)
// =============================================
async function triggerAutomations(event: any) {
  try {
    const { data: playbooks } = await supabase
      .from('automation_playbooks')
      .select('*')
      .eq('organization_id', event.organization_id)
      .eq('is_active', true)
      .eq('trigger_type', 'event')

    if (!playbooks?.length) return

    for (const playbook of playbooks) {
      const triggerEventType = playbook.trigger_config?.event_type
      if (triggerEventType && triggerEventType !== event.event_type) continue

      if (playbook.settings?.cooldown_days && event.contact_id) {
        const cooldownDate = new Date()
        cooldownDate.setDate(cooldownDate.getDate() - playbook.settings.cooldown_days)
        const { data: recent } = await supabase
          .from('playbook_runs')
          .select('id')
          .eq('playbook_id', playbook.id)
          .eq('contact_id', event.contact_id)
          .gte('started_at', cooldownDate.toISOString())
          .limit(1)
        if (recent?.length) continue
      }

      if (playbook.settings?.max_per_contact && event.contact_id) {
        const { count } = await supabase
          .from('playbook_runs')
          .select('*', { count: 'exact', head: true })
          .eq('playbook_id', playbook.id)
          .eq('contact_id', event.contact_id)
        if (count && count >= playbook.settings.max_per_contact) continue
      }

      const delay = playbook.trigger_config?.delay_minutes || 0
      const nextStepAt = new Date()
      nextStepAt.setMinutes(nextStepAt.getMinutes() + delay)

      await supabase
        .from('playbook_runs')
        .insert({
          organization_id: event.organization_id,
          playbook_id: playbook.id,
          contact_id: event.contact_id,
          status: 'running',
          triggered_by: 'event',
          trigger_event_id: event.id,
          next_step_at: nextStepAt.toISOString(),
        })

      console.log(`[Automation] Triggered ${playbook.name} for contact ${event.contact_id}`)
    }
  } catch (error) {
    console.error('[Automation Trigger] Error:', error)
  }
}

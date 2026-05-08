import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { metric: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const orgId = auth.user.organization_id
    const metricType = params.metric
    const { searchParams } = request.nextUrl
    const days = parseInt(searchParams.get('days') || '30')
    const tab = searchParams.get('tab') || 'chart'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const storeId = searchParams.get('storeId')

    const since = new Date()
    since.setDate(since.getDate() - days)

    // Build base filter: storeId takes priority over orgId
    function applyScope(query: any) {
      if (storeId) return query.eq('store_id', storeId)
      return query.eq('organization_id', orgId)
    }

    if (tab === 'chart') {
      let chartQuery = supabaseAdmin
        .from('contact_events')
        .select('occurred_at')
        .eq('event_type', metricType)
        .gte('occurred_at', since.toISOString())
        .order('occurred_at', { ascending: true })

      const { data: events } = await applyScope(chartQuery)

      // Group by day
      const dailyCounts: Record<string, number> = {}
      const current = new Date(since)
      while (current <= new Date()) {
        dailyCounts[current.toISOString().slice(0, 10)] = 0
        current.setDate(current.getDate() + 1)
      }
      ;(events || []).forEach((e: any) => {
        const day = new Date(e.occurred_at).toISOString().slice(0, 10)
        if (dailyCounts[day] !== undefined) dailyCounts[day]++
      })

      const chartData = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }))
      const total = (events || []).length

      return NextResponse.json({ chartData, total, days })
    }

    if (tab === 'feed') {
      // Activity feed with contact info.
      //
      // Two ordering / display fixes vs the previous version:
      //
      // 1. Order by `received_at` (when the server registered the event)
      //    instead of `occurred_at` (timestamp on the event itself —
      //    can be skewed by client clocks or batched late-fires). This
      //    matches the order the diagnostic-tracking dashboard shows,
      //    so an event that's "2m atrás" in debug appears at the top
      //    here too.
      //
      // 2. The displayed name/email comes from the EVENT's own
      //    properties first (the email actually typed by the visitor),
      //    falling back to the linked contact. Without this fallback,
      //    when the identity graph merges two visitors into one
      //    contact (e.g. shared fingerprint), every event for either
      //    visitor renders as the "winning" contact's name even
      //    though the event clearly originated from someone else.
      const offset = (page - 1) * limit
      let feedQuery = supabaseAdmin
        .from('contact_events')
        .select('*, contacts(id, first_name, last_name, email)', { count: 'exact' })
        .eq('event_type', metricType)
        .order('received_at', { ascending: false })
        .range(offset, offset + limit - 1)

      const { data: events, count } = await applyScope(feedQuery)

      function pickEventEmail(props: any): string | null {
        if (!props || typeof props !== 'object') return null
        const e =
          props.email ||
          props.Email ||
          props.CustomerEmail ||
          props?.Customer?.Email ||
          props.raw?.email ||
          props.raw?.contact_email ||
          props.raw?.customer?.email ||
          null
        return e ? String(e).toLowerCase() : null
      }
      function pickEventName(props: any): string | null {
        if (!props || typeof props !== 'object') return null
        const fn =
          props._first_name ||
          props.first_name ||
          props.FirstName ||
          props?.Customer?.FirstName ||
          props.raw?.customer?.first_name ||
          null
        const ln =
          props._last_name ||
          props.last_name ||
          props.LastName ||
          props?.Customer?.LastName ||
          props.raw?.customer?.last_name ||
          null
        const full = [fn, ln].filter(Boolean).join(' ').trim()
        return full || null
      }

      return NextResponse.json({
        events: (events || []).map((e: any) => {
          // Prefer the email that was on the event itself (what the
          // visitor actually typed). Fall back to the linked contact
          // for older / pre-identification events.
          const eventEmail = pickEventEmail(e.properties)
          const eventName = pickEventName(e.properties)
          const contactName = e.contacts
            ? `${e.contacts.first_name || ''} ${e.contacts.last_name || ''}`.trim() || e.contacts.email
            : null
          return {
            id: e.id,
            contactId: e.contact_id,
            contactName: eventName || contactName || eventEmail || 'Desconhecido',
            contactEmail: eventEmail || e.contacts?.email || '',
            // Surface that there's a different contact-linked email
            // when relevant (helps the merchant spot identity-merge
            // collisions in the wild).
            contactLinkedEmail: e.contacts?.email && eventEmail && e.contacts.email.toLowerCase() !== eventEmail
              ? e.contacts.email
              : null,
            eventType: e.event_type,
            properties: e.properties,
            monetaryValue: e.monetary_value,
            currency: e.currency,
            occurredAt: e.occurred_at,
            receivedAt: e.received_at,
            shopifyResourceId: e.shopify_resource_id,
          }
        }),
        total: count || 0,
        page,
        limit,
      })
    }

    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
  } catch (error: any) {
    console.error('[Metric Detail]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

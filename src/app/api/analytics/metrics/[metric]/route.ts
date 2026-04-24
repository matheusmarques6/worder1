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
      // Activity feed with contact info
      const offset = (page - 1) * limit
      let feedQuery = supabaseAdmin
        .from('contact_events')
        .select('*, contacts(id, first_name, last_name, email)', { count: 'exact' })
        .eq('event_type', metricType)
        .order('occurred_at', { ascending: false })
        .range(offset, offset + limit - 1)

      const { data: events, count } = await applyScope(feedQuery)

      return NextResponse.json({
        events: (events || []).map((e: any) => ({
          id: e.id,
          contactId: e.contact_id,
          contactName: e.contacts ? `${e.contacts.first_name || ''} ${e.contacts.last_name || ''}`.trim() || e.contacts.email : 'Desconhecido',
          contactEmail: e.contacts?.email || '',
          eventType: e.event_type,
          properties: e.properties,
          monetaryValue: e.monetary_value,
          currency: e.currency,
          occurredAt: e.occurred_at,
          receivedAt: e.received_at,
          shopifyResourceId: e.shopify_resource_id,
        })),
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

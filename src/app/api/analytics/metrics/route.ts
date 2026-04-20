import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Metric definitions
const SHOPIFY_METRICS = [
  { key: 'added_to_cart', label: 'Added to Cart', icon: 'ShoppingCart' },
  { key: 'checkout_started', label: 'Checkout Started', icon: 'CreditCard' },
  { key: 'checkout_completed', label: 'Checkout Completed', icon: 'CheckCircle' },
  { key: 'placed_order', label: 'Placed Order', icon: 'Package' },
  { key: 'ordered_product', label: 'Ordered Product', icon: 'Box' },
  { key: 'fulfilled_order', label: 'Fulfilled Order', icon: 'Truck' },
  { key: 'cancelled_order', label: 'Cancelled Order', icon: 'XCircle' },
  { key: 'refunded_order', label: 'Refunded Order', icon: 'RotateCcw' },
  { key: 'viewed_product', label: 'Viewed Product', icon: 'Eye' },
  { key: 'active_on_site', label: 'Active on Site', icon: 'Activity' },
]

const WORDER_METRICS = [
  { key: 'email_received', label: 'Email Received', icon: 'Mail' },
  { key: 'email_opened', label: 'Email Opened', icon: 'MailOpen' },
  { key: 'email_clicked', label: 'Email Clicked', icon: 'MousePointerClick' },
  { key: 'email_bounced', label: 'Email Bounced', icon: 'MailX' },
  { key: 'email_unsubscribed', label: 'Unsubscribed', icon: 'UserMinus' },
]

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const orgId = auth.user.organization_id
    const { searchParams } = request.nextUrl
    const integration = searchParams.get('integration') || 'all'
    const days = parseInt(searchParams.get('days') || '30')

    const since = new Date()
    since.setDate(since.getDate() - days)

    // Count events by type
    const { data: counts } = await supabaseAdmin
      .from('contact_events')
      .select('event_type')
      .eq('organization_id', orgId)
      .gte('occurred_at', since.toISOString())

    const countMap: Record<string, number> = {}
    ;(counts || []).forEach((row: any) => {
      countMap[row.event_type] = (countMap[row.event_type] || 0) + 1
    })

    let metrics = []
    if (integration === 'all' || integration === 'shopify') {
      metrics.push(...SHOPIFY_METRICS.map(m => ({ ...m, count: countMap[m.key] || 0, integration: 'shopify' })))
    }
    if (integration === 'all' || integration === 'worder') {
      metrics.push(...WORDER_METRICS.map(m => ({ ...m, count: countMap[m.key] || 0, integration: 'worder' })))
    }

    return NextResponse.json({ metrics, days })
  } catch (error: any) {
    console.error('[Metrics]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

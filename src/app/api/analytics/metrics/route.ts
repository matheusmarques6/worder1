import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Metric definitions — grouped by integration/source
const SHOPIFY_METRICS = [
  // Ecommerce funnel
  { key: 'viewed_product', label: 'Viewed Product', icon: 'Eye' },
  { key: 'viewed_collection', label: 'Viewed Collection', icon: 'LayoutGrid' },
  { key: 'submitted_search', label: 'Submitted Search', icon: 'Search' },
  { key: 'added_to_cart', label: 'Added to Cart', icon: 'ShoppingCart' },
  { key: 'removed_from_cart', label: 'Removed from Cart', icon: 'MinusCircle' },
  { key: 'cart_viewed', label: 'Cart Viewed', icon: 'ShoppingBag' },
  // Checkout funnel
  { key: 'checkout_started', label: 'Checkout Started', icon: 'CreditCard' },
  { key: 'checkout_contact_submitted', label: 'Checkout Contact Submitted', icon: 'User' },
  { key: 'payment_submitted', label: 'Payment Submitted', icon: 'Wallet' },
  { key: 'checkout_completed', label: 'Checkout Completed', icon: 'CheckCircle' },
  { key: 'checkout_abandoned', label: 'Checkout Abandoned', icon: 'AlertTriangle' },
  // Orders
  { key: 'placed_order', label: 'Placed Order', icon: 'Package' },
  { key: 'ordered_product', label: 'Ordered Product', icon: 'Box' },
  { key: 'fulfilled_order', label: 'Fulfilled Order', icon: 'Truck' },
  { key: 'shipment_confirmed', label: 'Shipment Confirmed', icon: 'PackageCheck' },
  { key: 'shipment_delivered', label: 'Shipment Delivered', icon: 'PackageOpen' },
  { key: 'cancelled_order', label: 'Cancelled Order', icon: 'XCircle' },
  { key: 'refunded_order', label: 'Refunded Order', icon: 'RotateCcw' },
  // On-site behavior
  { key: 'active_on_site', label: 'Active on Site', icon: 'Activity' },
  { key: 'page_viewed', label: 'Page Viewed', icon: 'FileText' },
]

const WORDER_METRICS = [
  // Email
  { key: 'email_received', label: 'Email Received', icon: 'Mail' },
  { key: 'email_opened', label: 'Email Opened', icon: 'MailOpen' },
  { key: 'email_clicked', label: 'Email Clicked', icon: 'MousePointerClick' },
  { key: 'email_bounced', label: 'Email Bounced', icon: 'MailX' },
  { key: 'email_unsubscribed', label: 'Unsubscribed', icon: 'UserMinus' },
  { key: 'email_conversion', label: 'Email Conversion', icon: 'Target' },
  // WhatsApp
  { key: 'whatsapp_message_received', label: 'WhatsApp Received', icon: 'MessageCircle' },
  { key: 'whatsapp_first_message', label: 'WhatsApp First Message', icon: 'MessageSquarePlus' },
  { key: 'whatsapp_keyword', label: 'WhatsApp Keyword', icon: 'Hash' },
  { key: 'ctwa_ad', label: 'Click-to-WhatsApp Ad', icon: 'MousePointer' },
  { key: 'back_in_stock', label: 'Back in Stock Alert', icon: 'Bell' },
  // Forms / Profile
  { key: 'form_submitted', label: 'Form Submitted', icon: 'ClipboardCheck' },
  { key: 'profile_created', label: 'Profile Created', icon: 'UserPlus' },
  { key: 'profile_updated', label: 'Profile Updated', icon: 'UserCog' },
  { key: 'subscribed_email', label: 'Subscribed to Email', icon: 'AtSign' },
  { key: 'subscribed_sms', label: 'Subscribed to SMS', icon: 'Smartphone' },
  // Lifecycle
  { key: 'rfm_segment_change', label: 'RFM Segment Change', icon: 'BarChart3' },
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

    // Count events by type using RPC (GROUP BY in SQL).
    // The old approach fetched every row and counted in JS, but PostgREST's
    // default 1000-row limit silently truncated results.
    const { data: counts, error: rpcError } = await supabaseAdmin
      .rpc('count_events_by_type', {
        p_org_id: orgId,
        p_since: since.toISOString(),
      })

    const countMap: Record<string, number> = {}
    if (rpcError) {
      // Log so the RPC-missing case is diagnosable instead of showing
      // silent zeros across every metric.
      console.error('[Metrics] count_events_by_type RPC failed:', rpcError.message || rpcError)
    } else if (counts) {
      for (const row of counts as any[]) {
        countMap[row.event_type] = Number(row.cnt) || 0
      }
    }

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

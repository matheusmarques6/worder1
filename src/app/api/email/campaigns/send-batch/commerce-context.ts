import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeIlikeWildcards } from '@/lib/forms/submit-utils'

type CommerceRecord = Record<string, unknown>

export async function loadCampaignCommerceContext(
  client: SupabaseClient,
  organizationId: string,
  storeId: string | null,
  contact: { id: string; email: string },
): Promise<{ order: CommerceRecord | null; cart: CommerceRecord | null }> {
  const email = JSON.stringify(escapeIlikeWildcards(contact.email))
  const filter = 'email.ilike.' + email + ',contact_id.eq.' + contact.id
  let orders = client
    .from('shopify_orders')
    .select('order_number, total_price, created_at, tracking_url, tracking_number, currency, line_items, financial_status')
    .eq('organization_id', organizationId)
    .or(filter)
  let carts = client
    .from('shopify_checkouts')
    .select('recovery_url, total_price, currency, line_items')
    .eq('organization_id', organizationId)
    .eq('status', 'abandoned')
    .or(filter)

  if (storeId) {
    orders = orders.eq('store_id', storeId)
    carts = carts.eq('store_id', storeId)
  }

  const [order, cart] = await Promise.allSettled([
    orders.order('created_at', { ascending: false }).limit(1).maybeSingle(),
    carts.order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  return {
    order: order.status === 'fulfilled' && !order.value.error ? order.value.data : null,
    cart: cart.status === 'fulfilled' && !cart.value.error ? cart.value.data : null,
  }
}

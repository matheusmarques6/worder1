// =============================================
// Back-in-Stock Notification Service
// Module B: Notify customers when product is available
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendMessage } from './message-service'
import { logger } from './logger'
import type { ServiceResult } from './types'

const LOG_PREFIX = 'BackInStockService'

/**
 * Called when a Shopify inventory webhook reports inventory > 0.
 * Finds all pending interest records for that product and notifies.
 */
export async function processProductBackInStock(params: {
  organizationId: string
  storeId?: string
  productId: string
  variantId?: string
  productTitle?: string
  productUrl?: string
}): Promise<ServiceResult<{ notified: number }>> {
  const { organizationId, storeId, productId, variantId, productTitle, productUrl } = params

  // Find pending interests for this product
  let query = supabaseAdmin
    .from('whatsapp_product_interests')
    .select('id, phone, contact_id, product_title')
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
    .eq('notified', false)

  if (storeId) query = query.eq('store_id', storeId)
  if (variantId) query = query.eq('variant_id', variantId)

  const { data: interests, error } = await query

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to fetch interests', error)
    return { error: error.message }
  }

  if (!interests || interests.length === 0) {
    return { data: { notified: 0 } }
  }

  // Get default instance for this org/store
  let instanceQuery = supabaseAdmin
    .from('whatsapp_instances')
    .select('id, phone_number_id, access_token')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .limit(1)

  if (storeId) instanceQuery = instanceQuery.eq('store_id', storeId)

  const { data: instances } = await instanceQuery
  const instance = instances?.[0]

  if (!instance) {
    return { error: 'No active WhatsApp instance found' }
  }

  const title = productTitle || interests[0].product_title || 'Produto'
  const messageText = [
    `🎉 Boas noticias!`,
    ``,
    `O produto *${title}* voltou ao estoque!`,
    productUrl ? `\n${productUrl}` : '',
    ``,
    `Garanta o seu antes que acabe novamente.`,
  ].filter(Boolean).join('\n')

  let notifiedCount = 0

  for (const interest of interests) {
    try {
      // Find or create conversation for this phone
      const { data: conv } = await supabaseAdmin
        .from('whatsapp_conversations')
        .upsert(
          {
            organization_id: organizationId,
            store_id: storeId,
            instance_id: instance.id,
            contact_phone: interest.phone,
            contact_id: interest.contact_id,
            status: 'open',
          },
          { onConflict: 'instance_id,contact_phone' }
        )
        .select()
        .single()

      if (!conv) continue

      // Check opt-out
      const { data: optStatus } = await supabaseAdmin
        .from('whatsapp_opt_status')
        .select('status')
        .eq('organization_id', organizationId)
        .eq('phone', interest.phone)
        .maybeSingle()

      if (optStatus?.status === 'opted_out') {
        // Mark as notified but don't send
        await supabaseAdmin
          .from('whatsapp_product_interests')
          .update({ notified: true, notified_at: new Date().toISOString() })
          .eq('id', interest.id)
        continue
      }

      // Send message (uses template if outside 24h window)
      await sendMessage({
        conversationId: conv.id,
        organizationId,
        instanceId: instance.id,
        to: interest.phone,
        messageType: 'text',
        content: messageText,
        senderType: 'system',
        senderName: 'Sistema',
      })

      // Mark as notified
      await supabaseAdmin
        .from('whatsapp_product_interests')
        .update({ notified: true, notified_at: new Date().toISOString() })
        .eq('id', interest.id)

      notifiedCount++
    } catch (err) {
      logger.error(LOG_PREFIX, `Failed to notify ${interest.phone}`, err)
    }
  }

  logger.info(LOG_PREFIX, `Notified ${notifiedCount}/${interests.length} interests for product ${productId}`)
  return { data: { notified: notifiedCount } }
}

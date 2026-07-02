// =============================================
// Shopify Coupon Generation Service
// Module E: Giftback / Cashback automatico
// =============================================

import { logger } from './logger'
import type { ServiceResult } from './types'

const LOG_PREFIX = 'ShopifyCouponService'

export interface GenerateCouponParams {
  shopDomain: string
  accessToken: string
  discountType: 'percentage' | 'fixed_amount'
  value: number
  validityDays?: number
  prefix?: string
  contactEmail?: string
  usageLimit?: number
  minimumAmount?: number
  title?: string
}

export interface CouponResult {
  id: string
  code: string
  priceRuleId: string
  startsAt: string
  endsAt: string
  usageLimit: number
}

/**
 * Creates a Shopify price rule + discount code.
 * Returns the code to be sent to the customer via WhatsApp.
 */
export async function generateShopifyCoupon(
  params: GenerateCouponParams
): Promise<ServiceResult<CouponResult>> {
  const {
    shopDomain,
    accessToken,
    discountType,
    value,
    validityDays = 7,
    prefix = 'GIFT',
    usageLimit = 1,
    minimumAmount,
    title,
  } = params

  if (!shopDomain || !accessToken) {
    return { error: 'shopDomain and accessToken required' }
  }

  const normalizedDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const apiVersion = '2026-04'

  // Generate unique code
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase()
  const code = `${prefix}-${randomPart}`

  const startsAt = new Date().toISOString()
  const endsAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Step 1: Create price rule
    const priceRulePayload = {
      price_rule: {
        title: title || `Cupom WhatsApp ${code}`,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: discountType === 'percentage' ? 'percentage' : 'fixed_amount',
        value: discountType === 'percentage' ? `-${value}` : `-${value}`,
        customer_selection: 'all',
        starts_at: startsAt,
        ends_at: endsAt,
        usage_limit: usageLimit,
        once_per_customer: true,
        ...(minimumAmount
          ? {
              prerequisite_subtotal_range: {
                greater_than_or_equal_to: minimumAmount.toFixed(2),
              },
            }
          : {}),
      },
    }

    const priceRuleRes = await fetch(
      `https://${normalizedDomain}/admin/api/${apiVersion}/price_rules.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(priceRulePayload),
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!priceRuleRes.ok) {
      const errText = await priceRuleRes.text()
      logger.error(LOG_PREFIX, `price_rule failed: ${priceRuleRes.status}`, errText)
      return { error: `Shopify price_rule error: ${priceRuleRes.status}` }
    }

    const priceRuleData = await priceRuleRes.json()
    const priceRuleId = priceRuleData.price_rule?.id
    if (!priceRuleId) {
      return { error: 'Shopify did not return price_rule id' }
    }

    // Step 2: Create discount code linked to price rule
    const discountRes = await fetch(
      `https://${normalizedDomain}/admin/api/${apiVersion}/price_rules/${priceRuleId}/discount_codes.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discount_code: { code },
        }),
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!discountRes.ok) {
      const errText = await discountRes.text()
      logger.error(LOG_PREFIX, `discount_code failed: ${discountRes.status}`, errText)
      return { error: `Shopify discount_code error: ${discountRes.status}` }
    }

    const discountData = await discountRes.json()
    const discountId = discountData.discount_code?.id

    logger.info(LOG_PREFIX, `Generated coupon ${code} (price_rule: ${priceRuleId})`)

    return {
      data: {
        id: String(discountId),
        code,
        priceRuleId: String(priceRuleId),
        startsAt,
        endsAt,
        usageLimit,
      },
    }
  } catch (err: unknown) {
    const error = err as Error
    logger.error(LOG_PREFIX, 'Generation failed', error.message)
    return { error: error.message }
  }
}

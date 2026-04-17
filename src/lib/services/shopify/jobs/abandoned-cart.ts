// =============================================
// Shopify Abandoned Cart Detection Job
// src/lib/services/shopify/jobs/abandoned-cart.ts
//
// Detects abandoned checkouts using:
// 1. Local DB (checkouts saved from webhooks)
// 2. GraphQL polling (fetch from Shopify API)
// Creates CDP events and triggers automations.
// =============================================

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createOrUpdateDealForContact } from '../deal-sync';
import { addAbandonedCartTag } from '../contact-sync';
import { syncContactFromShopify } from '../contact-sync';
import type { ShopifyStoreConfig, ShopifyCustomer } from '../types';
import { shopifyGraphQL } from '@/lib/shopify/graphql-client';
import { ABANDONED_CHECKOUTS_QUERY } from '@/lib/shopify/graphql-queries';
import { extractShopifyId } from '@/lib/shopify/graphql-client';
import { createEvent } from '@/lib/shopify/event-service';
import { WORDER_SHOPIFY_EVENTS, EVENT_SOURCES } from '@/lib/shopify/event-types';

const ABANDONMENT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

interface AbandonedCartResult {
  storesProcessed: number;
  checkoutsProcessed: number;
  abandoned: number;
  converted: number;
  errors: number;
}

/**
 * Detecta carrinhos abandonados em todas as lojas ativas
 */
export async function detectAbandonedCarts(): Promise<AbandonedCartResult> {
  console.log('[AbandonedCart] Starting detection...');

  const result: AbandonedCartResult = {
    storesProcessed: 0,
    checkoutsProcessed: 0,
    abandoned: 0,
    converted: 0,
    errors: 0,
  };

  try {
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('is_active', true)
      .eq('sync_checkouts', true);

    if (storesError || !stores?.length) {
      if (storesError) console.error('Failed to fetch stores:', storesError);
      else console.log('No active stores with checkout sync enabled');
      return result;
    }

    for (const store of stores) {
      try {
        // Phase 1: Check local DB for pending checkouts
        const localResult = await detectAbandonedCartsFromDB(store);
        result.storesProcessed++;
        result.checkoutsProcessed += localResult.processed;
        result.abandoned += localResult.abandoned;
        result.converted += localResult.converted;

        // Phase 2: Poll Shopify GraphQL for new abandoned checkouts
        const graphqlResult = await pollAbandonedCheckoutsGraphQL(store);
        result.checkoutsProcessed += graphqlResult.processed;
        result.abandoned += graphqlResult.abandoned;
      } catch (error) {
        console.error(`Error processing store ${store.shop_domain}:`, error);
        result.errors++;
      }
    }

    console.log('[AbandonedCart] Detection completed:', result);
    return result;
  } catch (error) {
    console.error('Abandoned cart detection failed:', error);
    return result;
  }
}

/**
 * Detect abandoned carts from local DB (webhook-received checkouts)
 */
async function detectAbandonedCartsFromDB(
  store: any
): Promise<{ processed: number; abandoned: number; converted: number }> {
  const storeConfig = buildStoreConfig(store);
  const thresholdTime = new Date(Date.now() - ABANDONMENT_THRESHOLD_MS);

  const { data: pendingCheckouts, error } = await supabase
    .from('shopify_checkouts')
    .select('*')
    .eq('store_id', store.id)
    .eq('status', 'pending')
    .lt('created_at', thresholdTime.toISOString())
    .limit(100);

  if (error || !pendingCheckouts?.length) {
    return { processed: 0, abandoned: 0, converted: 0 };
  }

  let abandoned = 0;
  let converted = 0;

  for (const checkout of pendingCheckouts) {
    // Check if converted to order
    const { data: order } = await supabase
      .from('shopify_orders')
      .select('id')
      .eq('store_id', store.id)
      .or(`email.eq.${checkout.email},shopify_checkout_id.eq.${checkout.shopify_checkout_id}`)
      .gte('created_at', checkout.created_at)
      .limit(1)
      .maybeSingle();

    if (order) {
      await supabase
        .from('shopify_checkouts')
        .update({
          status: 'converted',
          converted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkout.id);
      converted++;
    } else {
      // Mark as abandoned
      await supabase
        .from('shopify_checkouts')
        .update({
          status: 'abandoned',
          abandoned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkout.id);
      abandoned++;

      // Last-mile contact resolution: if email was captured but contact_id
      // is still null, look it up now and backfill the link.
      if (!checkout.contact_id && checkout.email) {
        try {
          const { data: c } = await supabase
            .from('contacts')
            .select('id')
            .eq('organization_id', store.organization_id)
            .ilike('email', checkout.email)
            .maybeSingle();
          if (c?.id) {
            checkout.contact_id = c.id;
            await supabase
              .from('shopify_checkouts')
              .update({ contact_id: c.id })
              .eq('id', checkout.id);
          }
        } catch {}
      }

      // Create CDP event
      await createAbandonedCheckoutEvent(storeConfig, checkout);

      // Tag contact and create deal
      if (checkout.contact_id) {
        await addAbandonedCartTag(checkout.contact_id);

        if (storeConfig.stage_mapping?.abandoned_cart || storeConfig.default_pipeline_id) {
          await createOrUpdateDealForContact(
            checkout.contact_id,
            storeConfig,
            'abandoned_cart',
            checkout.total_price,
            {
              checkout_id: checkout.id,
              shopify_checkout_id: checkout.shopify_checkout_id,
              recovery_url: checkout.recovery_url,
              abandoned_at: new Date().toISOString(),
            }
          );
        }
      }

      await createAbandonedCartNotification(store, checkout);
    }
  }

  return { processed: pendingCheckouts.length, abandoned, converted };
}

/**
 * Poll Shopify GraphQL API for abandoned checkouts not yet in our DB
 */
async function pollAbandonedCheckoutsGraphQL(
  store: any
): Promise<{ processed: number; abandoned: number }> {
  const storeConfig = {
    id: store.id,
    organization_id: store.organization_id,
    shop_domain: store.shop_domain,
    access_token: store.access_token,
  };

  let processed = 0;
  let abandoned = 0;

  try {
    // Query checkouts updated in the last 30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = await shopifyGraphQL(storeConfig, ABANDONED_CHECKOUTS_QUERY, {
      first: 50,
      query: `updated_at:>'${thirtyMinAgo}'`,
    });

    const checkouts = result.data?.abandonedCheckouts?.nodes || [];

    for (const checkout of checkouts) {
      processed++;
      const checkoutGid = checkout.id;
      const checkoutId = extractShopifyId(checkoutGid);

      // Skip if already completed
      if (checkout.completedAt) continue;

      // Skip if created too recently (not yet abandoned)
      const createdAt = new Date(checkout.createdAt);
      if (Date.now() - createdAt.getTime() < ABANDONMENT_THRESHOLD_MS) continue;

      // Check if already tracked in our DB
      const { data: existing } = await supabase
        .from('shopify_checkouts')
        .select('id, status')
        .eq('store_id', store.id)
        .eq('shopify_checkout_id', checkoutId)
        .maybeSingle();

      if (existing?.status === 'abandoned' || existing?.status === 'converted') continue;

      // Extract data
      const email = checkout.email || checkout.customer?.email;
      const phone = checkout.phone || checkout.customer?.phone;
      const totalPrice = parseFloat(checkout.totalPriceSet?.shopMoney?.amount || '0');
      const currency = checkout.totalPriceSet?.shopMoney?.currencyCode || 'BRL';

      const lineItems = (checkout.lineItems?.nodes || []).map((li: any) => ({
        title: li.title,
        quantity: li.quantity,
        sku: li.sku,
        variant_title: li.variantTitle,
        price: li.variant?.price || '0',
        product_id: li.variant?.product?.id ? extractShopifyId(li.variant.product.id) : null,
        image_url: li.variant?.product?.featuredImage?.url || null,
      }));

      // Upsert checkout in DB (write both URL columns for schema compat)
      const { error: upsertErr } = await supabase.from('shopify_checkouts').upsert({
        store_id: store.id,
        organization_id: store.organization_id,
        shopify_checkout_id: checkoutId,
        email,
        phone,
        total_price: totalPrice,
        subtotal_price: parseFloat(checkout.subtotalPriceSet?.shopMoney?.amount || '0'),
        currency,
        line_items: lineItems,
        recovery_url: checkout.abandonedCheckoutUrl,
        abandoned_checkout_url: checkout.abandonedCheckoutUrl,
        status: 'abandoned',
        abandoned_at: new Date().toISOString(),
        shopify_created_at: checkout.createdAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'store_id,shopify_checkout_id',
      });
      if (upsertErr) {
        console.error(`[AbandonedCart] GraphQL: shopify_checkouts upsert FAILED for ${checkoutId}:`, upsertErr);
      }

      // Resolve contact
      let contactId: string | null = null;
      if (email || phone) {
        const fullStoreConfig = buildStoreConfig(store);
        const customerData: ShopifyCustomer = {
          id: checkout.customer?.id ? parseInt(extractShopifyId(checkout.customer.id)) : 0,
          email: email || '',
          phone: phone || null,
          first_name: checkout.customer?.firstName || checkout.shippingAddress?.firstName || '',
          last_name: checkout.customer?.lastName || checkout.shippingAddress?.lastName || '',
          orders_count: 0,
          total_spent: '0',
          tags: '',
          accepts_marketing: false,
          created_at: checkout.createdAt,
          updated_at: checkout.updatedAt,
        };
        const contact = await syncContactFromShopify(customerData, fullStoreConfig, 'checkout');
        contactId = contact?.id || null;
      }

      // Create CDP event
      await createEvent({
        organization_id: store.organization_id,
        contact_id: contactId,
        store_id: store.id,
        event_type: WORDER_SHOPIFY_EVENTS.CHECKOUT_ABANDONED,
        event_source: EVENT_SOURCES.CRON_JOB,
        properties: {
          checkout_id: checkoutId,
          checkout_url: checkout.abandonedCheckoutUrl,
          total_price: totalPrice,
          currency,
          item_count: lineItems.length,
          items: lineItems,
        },
        monetary_value: totalPrice,
        currency,
        shopify_resource_id: checkoutId,
        shopify_resource_type: 'checkout',
        occurred_at: checkout.createdAt,
        idempotency_key: `checkout_abandoned:${checkoutId}`,
      });

      abandoned++;
      console.log(`[AbandonedCart] GraphQL: Checkout ${checkoutId} marked as abandoned (${email || 'no email'})`);
    }
  } catch (error) {
    console.error(`[AbandonedCart] GraphQL polling failed for ${store.shop_domain}:`, error);
  }

  return { processed, abandoned };
}

/**
 * Create a CDP event for an abandoned checkout from local DB
 */
async function createAbandonedCheckoutEvent(
  store: ShopifyStoreConfig,
  checkout: any
): Promise<void> {
  try {
    await createEvent({
      organization_id: store.organization_id,
      contact_id: checkout.contact_id || null,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.CHECKOUT_ABANDONED,
      event_source: EVENT_SOURCES.CRON_JOB,
      properties: {
        checkout_id: checkout.shopify_checkout_id || checkout.id,
        checkout_url: checkout.recovery_url || checkout.abandoned_checkout_url,
        total_price: parseFloat(checkout.total_price || '0'),
        currency: checkout.currency || 'BRL',
        item_count: checkout.line_items?.length || 0,
        items: checkout.line_items || [],
      },
      monetary_value: parseFloat(checkout.total_price || '0'),
      currency: checkout.currency || 'BRL',
      shopify_resource_id: checkout.shopify_checkout_id || String(checkout.id),
      shopify_resource_type: 'checkout',
      occurred_at: checkout.created_at || new Date().toISOString(),
      idempotency_key: `checkout_abandoned:${checkout.shopify_checkout_id || checkout.id}`,
    });
  } catch (error) {
    console.error('[AbandonedCart] Failed to create CDP event:', error);
  }
}

// =============================================
// HELPERS
// =============================================

function buildStoreConfig(store: any): ShopifyStoreConfig {
  return {
    id: store.id,
    organization_id: store.organization_id,
    shop_domain: store.shop_domain,
    shop_name: store.shop_name,
    access_token: store.access_token,
    api_secret: store.api_secret,
    default_pipeline_id: store.default_pipeline_id,
    default_stage_id: store.default_stage_id,
    contact_type: store.contact_type || 'auto',
    auto_tags: store.auto_tags || ['shopify'],
    sync_orders: store.sync_orders ?? true,
    sync_customers: store.sync_customers ?? true,
    sync_checkouts: store.sync_checkouts ?? true,
    sync_refunds: store.sync_refunds ?? false,
    stage_mapping: store.stage_mapping || {},
    is_configured: store.is_configured ?? false,
    is_active: store.is_active ?? true,
    connection_status: store.connection_status || 'active',
  };
}

async function createAbandonedCartNotification(store: any, checkout: any): Promise<void> {
  try {
    const value = checkout.total_price || 0;
    const formattedValue = typeof value === 'number'
      ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : `R$ ${value}`;

    await supabase.from('notifications').insert({
      organization_id: store.organization_id,
      type: 'shopify_abandoned_cart',
      title: `Carrinho abandonado: ${formattedValue}`,
      message: `${checkout.email || 'Cliente'} abandonou um carrinho na loja ${store.shop_name || store.shop_domain}`,
      data: {
        checkout_id: checkout.id,
        shopify_checkout_id: checkout.shopify_checkout_id,
        recovery_url: checkout.recovery_url,
        contact_id: checkout.contact_id,
        email: checkout.email,
        phone: checkout.phone,
        value: checkout.total_price,
        items_count: checkout.line_items?.length || 0,
      },
      is_read: false,
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

/**
 * Mark a checkout as recovered when an order is created with the same email
 */
export async function markCheckoutRecovered(
  storeId: string,
  email: string,
  orderId: string
): Promise<void> {
  try {
    const { data: abandonedCheckout } = await supabase
      .from('shopify_checkouts')
      .select('id, shopify_checkout_id')
      .eq('store_id', storeId)
      .eq('email', email)
      .eq('status', 'abandoned')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (abandonedCheckout) {
      await supabase
        .from('shopify_checkouts')
        .update({
          status: 'recovered',
          converted_order_id: orderId,
          converted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', abandonedCheckout.id);

      console.log(`[AbandonedCart] Checkout ${abandonedCheckout.id} marked as recovered (order: ${orderId})`);
    }
  } catch (error) {
    console.error('[AbandonedCart] Failed to mark checkout as recovered:', error);
  }
}

/**
 * Limpa eventos de webhook antigos (> 7 dias)
 */
export async function cleanupOldWebhookEvents(): Promise<number> {
  console.log('Cleaning up old webhook events...');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('shopify_webhook_events')
    .delete()
    .lt('created_at', sevenDaysAgo.toISOString())
    .select('id');

  if (error) {
    console.error('Failed to cleanup webhook events:', error);
    return 0;
  }

  // Also clean old webhook_log entries
  await supabase
    .from('shopify_webhook_log')
    .delete()
    .lt('received_at', sevenDaysAgo.toISOString());

  const count = data?.length || 0;
  console.log(`Cleaned up ${count} old webhook events`);
  return count;
}

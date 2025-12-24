// =============================================
// Shopify Abandoned Cart Detection Job
// src/lib/services/shopify/jobs/abandoned-cart.ts
// 
// Este job roda periodicamente (a cada 30 min) para:
// 1. Encontrar checkouts pendentes há mais de 1 hora
// 2. Verificar se não viraram pedidos
// 3. Marcar como abandonados
// 4. Criar deals e notificações
// =============================================

import { createClient } from '@supabase/supabase-js';
import { createOrUpdateDealForContact } from '../deal-sync';
import { addAbandonedCartTag } from '../contact-sync';
import type { ShopifyStoreConfig } from '../types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  console.log('🛒 Starting abandoned cart detection...');
  
  const result: AbandonedCartResult = {
    storesProcessed: 0,
    checkoutsProcessed: 0,
    abandoned: 0,
    converted: 0,
    errors: 0,
  };
  
  try {
    // Buscar lojas ativas com sync_checkouts habilitado
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('is_active', true)
      .eq('is_configured', true)
      .eq('sync_checkouts', true);
    
    if (storesError) {
      console.error('Failed to fetch stores:', storesError);
      return result;
    }
    
    if (!stores?.length) {
      console.log('No active stores with checkout sync enabled');
      return result;
    }
    
    // Processar cada loja
    for (const store of stores) {
      try {
        const storeResult = await detectAbandonedCartsForStore(store);
        result.storesProcessed++;
        result.checkoutsProcessed += storeResult.processed;
        result.abandoned += storeResult.abandoned;
        result.converted += storeResult.converted;
      } catch (error) {
        console.error(`Error processing store ${store.shop_domain}:`, error);
        result.errors++;
      }
    }
    
    console.log(`🛒 Abandoned cart detection completed:`, result);
    return result;
    
  } catch (error) {
    console.error('Abandoned cart detection failed:', error);
    return result;
  }
}

/**
 * Detecta carrinhos abandonados para uma loja específica
 */
async function detectAbandonedCartsForStore(
  store: any
): Promise<{ processed: number; abandoned: number; converted: number }> {
  
  const storeConfig: ShopifyStoreConfig = {
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
  
  // Checkouts pendentes criados há mais de 1 hora
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const { data: pendingCheckouts, error } = await supabase
    .from('shopify_checkouts')
    .select('*')
    .eq('store_id', store.id)
    .eq('status', 'pending')
    .lt('created_at', oneHourAgo.toISOString())
    .limit(100);
  
  if (error) {
    console.error(`Failed to fetch checkouts for ${store.shop_domain}:`, error);
    return { processed: 0, abandoned: 0, converted: 0 };
  }
  
  if (!pendingCheckouts?.length) {
    return { processed: 0, abandoned: 0, converted: 0 };
  }
  
  let abandoned = 0;
  let converted = 0;
  
  for (const checkout of pendingCheckouts) {
    // Verificar se virou pedido (pelo email ou pelo checkout_id)
    const { data: order } = await supabase
      .from('shopify_orders')
      .select('id')
      .eq('store_id', store.id)
      .or(`email.eq.${checkout.email},shopify_checkout_id.eq.${checkout.shopify_checkout_id}`)
      .gte('created_at', checkout.created_at)
      .limit(1)
      .maybeSingle();
    
    if (order) {
      // Converteu em pedido - marcar como convertido
      await supabase
        .from('shopify_checkouts')
        .update({
          status: 'converted',
          converted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkout.id);
      
      converted++;
      console.log(`✅ Checkout ${checkout.id} converted to order`);
      
    } else {
      // É um carrinho abandonado!
      abandoned++;
      
      // Marcar como abandonado
      await supabase
        .from('shopify_checkouts')
        .update({
          status: 'abandoned',
          abandoned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkout.id);
      
      // Se tem contato, adicionar tag e criar deal
      if (checkout.contact_id) {
        // Adicionar tag de carrinho abandonado
        await addAbandonedCartTag(checkout.contact_id);
        
        // Criar deal no estágio de carrinho abandonado (se configurado)
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
      
      // Criar notificação
      await createAbandonedCartNotification(store, checkout);
      
      console.log(`🛒 Checkout ${checkout.id} marked as abandoned`);
    }
  }
  
  return {
    processed: pendingCheckouts.length,
    abandoned,
    converted,
  };
}

/**
 * Cria notificação de carrinho abandonado
 */
async function createAbandonedCartNotification(
  store: any,
  checkout: any
): Promise<void> {
  try {
    const value = checkout.total_price || 0;
    const formattedValue = value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    
    await supabase
      .from('notifications')
      .insert({
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
 * Limpa eventos de webhook antigos (> 7 dias)
 */
export async function cleanupOldWebhookEvents(): Promise<number> {
  console.log('🧹 Cleaning up old webhook events...');
  
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
  
  const count = data?.length || 0;
  console.log(`🧹 Cleaned up ${count} old webhook events`);
  
  return count;
}

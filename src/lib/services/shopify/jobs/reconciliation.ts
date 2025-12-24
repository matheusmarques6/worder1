// =============================================
// Shopify Reconciliation Job
// src/lib/services/shopify/jobs/reconciliation.ts
// 
// Este job roda periodicamente (a cada 1 hora) para:
// 1. Buscar dados que podem ter sido perdidos por webhooks
// 2. Sincronizar clientes e pedidos atualizados
// 3. Garantir consistência entre Shopify e CRM
// =============================================

import { createClient } from '@supabase/supabase-js';
import { ShopifyClient } from '@/lib/integrations/shopify';
import { syncContactFromShopify, updateContactOrderStats } from '../contact-sync';
import { createOrUpdateDealForContact } from '../deal-sync';
import type { ShopifyStoreConfig, ShopifyCustomer, ShopifyOrder } from '../types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ReconciliationResult {
  storesProcessed: number;
  customersReconciled: number;
  ordersReconciled: number;
  errors: number;
}

/**
 * Executa reconciliação em todas as lojas ativas
 */
export async function runReconciliation(): Promise<ReconciliationResult> {
  console.log('🔄 Starting reconciliation...');
  
  const result: ReconciliationResult = {
    storesProcessed: 0,
    customersReconciled: 0,
    ordersReconciled: 0,
    errors: 0,
  };
  
  try {
    // Buscar lojas ativas
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('is_active', true)
      .eq('is_configured', true);
    
    if (storesError) {
      console.error('Failed to fetch stores:', storesError);
      return result;
    }
    
    if (!stores?.length) {
      console.log('No active stores to reconcile');
      return result;
    }
    
    // Processar cada loja
    for (const store of stores) {
      try {
        const storeResult = await reconcileStore(store);
        result.storesProcessed++;
        result.customersReconciled += storeResult.customers;
        result.ordersReconciled += storeResult.orders;
        
        // Atualizar timestamp de reconciliação
        await supabase
          .from('shopify_stores')
          .update({ last_reconcile_at: new Date().toISOString() })
          .eq('id', store.id);
          
      } catch (error) {
        console.error(`Error reconciling store ${store.shop_domain}:`, error);
        result.errors++;
      }
    }
    
    console.log(`🔄 Reconciliation completed:`, result);
    return result;
    
  } catch (error) {
    console.error('Reconciliation failed:', error);
    return result;
  }
}

/**
 * Reconcilia uma loja específica
 */
async function reconcileStore(
  store: any
): Promise<{ customers: number; orders: number }> {
  
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
  
  // Criar cliente Shopify
  const client = new ShopifyClient({
    shopDomain: store.shop_domain,
    accessToken: store.access_token,
  });
  
  // Buscar desde última reconciliação (ou últimas 24h)
  const since = store.last_reconcile_at 
    ? new Date(store.last_reconcile_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  let customersReconciled = 0;
  let ordersReconciled = 0;
  
  // 1. Reconciliar clientes (se habilitado)
  if (storeConfig.sync_customers) {
    try {
      const { customers } = await client.getCustomers({ limit: 50 });
      
      // Filtrar clientes atualizados desde última sync
      const recentCustomers = customers.filter(c => 
        new Date(c.updated_at) > since
      );
      
      for (const customer of recentCustomers) {
        try {
          await syncContactFromShopify(customer as ShopifyCustomer, storeConfig, 'customer');
          customersReconciled++;
        } catch (error) {
          console.error(`Failed to reconcile customer ${customer.id}:`, error);
        }
      }
      
      console.log(`Reconciled ${customersReconciled} customers for ${store.shop_domain}`);
    } catch (error) {
      console.error(`Failed to fetch customers for ${store.shop_domain}:`, error);
    }
  }
  
  // 2. Reconciliar pedidos (se habilitado)
  if (storeConfig.sync_orders) {
    try {
      const { orders } = await client.getOrders({ limit: 50 });
      
      for (const order of orders) {
        // Verificar se já temos esse pedido
        const { data: existing } = await supabase
          .from('shopify_orders')
          .select('id')
          .eq('store_id', store.id)
          .eq('shopify_order_id', String(order.id))
          .maybeSingle();
        
        if (!existing) {
          // Pedido não existe - processar
          try {
            await processReconciliationOrder(order as ShopifyOrder, storeConfig);
            ordersReconciled++;
          } catch (error) {
            console.error(`Failed to reconcile order ${order.id}:`, error);
          }
        }
      }
      
      console.log(`Reconciled ${ordersReconciled} orders for ${store.shop_domain}`);
    } catch (error) {
      console.error(`Failed to fetch orders for ${store.shop_domain}:`, error);
    }
  }
  
  return { customers: customersReconciled, orders: ordersReconciled };
}

/**
 * Processa um pedido durante reconciliação
 */
async function processReconciliationOrder(
  order: ShopifyOrder,
  store: ShopifyStoreConfig
): Promise<void> {
  
  // Extrair dados do cliente
  const customerData = order.customer || {
    id: null as any,
    email: order.email,
    phone: order.phone,
    first_name: order.billing_address?.first_name || '',
    last_name: order.billing_address?.last_name || '',
    orders_count: 1,
  };
  
  // Sincronizar contato
  const contact = await syncContactFromShopify(
    customerData as ShopifyCustomer,
    store,
    'order'
  );
  
  // Atualizar estatísticas
  const orderValue = parseFloat(order.total_price || '0');
  await updateContactOrderStats(contact.id, orderValue);
  
  // Salvar pedido
  await supabase
    .from('shopify_orders')
    .upsert({
      store_id: store.id,
      organization_id: store.organization_id,
      shopify_order_id: String(order.id),
      shopify_order_number: String(order.order_number),
      contact_id: contact.id,
      customer_shopify_id: order.customer?.id ? String(order.customer.id) : null,
      email: order.email,
      phone: order.phone,
      total_price: orderValue,
      subtotal_price: parseFloat(order.subtotal_price || '0'),
      total_tax: parseFloat(order.total_tax || '0'),
      total_discounts: parseFloat(order.total_discounts || '0'),
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      line_items: order.line_items,
      shopify_created_at: order.created_at,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'store_id,shopify_order_id',
    });
  
  // Criar deal
  if (store.default_pipeline_id) {
    await createOrUpdateDealForContact(
      contact.id,
      store,
      'new_order',
      orderValue,
      {
        shopify_order_id: order.id,
        order_number: order.order_number,
        financial_status: order.financial_status,
        reconciled: true,
      }
    );
  }
}

/**
 * Verifica saúde dos webhooks e re-registra se necessário
 */
export async function checkWebhookHealth(): Promise<void> {
  console.log('🔍 Checking webhook health...');
  
  const { data: stores } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('is_active', true)
    .eq('is_configured', true);
  
  if (!stores?.length) return;
  
  for (const store of stores) {
    try {
      const client = new ShopifyClient({
        shopDomain: store.shop_domain,
        accessToken: store.access_token,
      });
      
      // Buscar webhooks registrados
      const { webhooks } = await client.getWebhooks();
      
      // Verificar se todos os webhooks necessários estão registrados
      const requiredTopics = [
        'customers/create',
        'customers/update',
        'orders/create',
        'orders/paid',
        'checkouts/create',
        'checkouts/update',
      ];
      
      const registeredTopics = webhooks.map((w: any) => w.topic);
      const missingTopics = requiredTopics.filter(t => !registeredTopics.includes(t));
      
      if (missingTopics.length > 0) {
        console.log(`Missing webhooks for ${store.shop_domain}:`, missingTopics);
        
        // Re-registrar webhooks faltantes
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
        if (baseUrl) {
          for (const topic of missingTopics) {
            try {
              await client.createWebhook({
                topic,
                address: `${baseUrl}/api/integrations/shopify/webhook`,
                format: 'json',
              });
              console.log(`Registered webhook: ${topic}`);
            } catch (error) {
              console.error(`Failed to register webhook ${topic}:`, error);
            }
          }
        }
      }
      
      // Atualizar status
      await supabase
        .from('shopify_stores')
        .update({
          connection_status: 'active',
          health_checked_at: new Date().toISOString(),
          consecutive_failures: 0,
        })
        .eq('id', store.id);
        
    } catch (error: any) {
      console.error(`Webhook health check failed for ${store.shop_domain}:`, error);
      
      // Incrementar falhas consecutivas
      await supabase
        .from('shopify_stores')
        .update({
          consecutive_failures: (store.consecutive_failures || 0) + 1,
          health_checked_at: new Date().toISOString(),
          status_message: error.message,
        })
        .eq('id', store.id);
    }
  }
  
  console.log('🔍 Webhook health check completed');
}

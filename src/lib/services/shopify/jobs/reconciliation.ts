// =============================================
// Shopify Reconciliation Job
// src/lib/services/shopify/jobs/reconciliation.ts
// 
// Este job roda periodicamente (a cada 1 hora) para:
// 1. Buscar dados que podem ter sido perdidos por webhooks
// 2. Sincronizar clientes e pedidos atualizados
// 3. Garantir consistência entre Shopify e CRM
// =============================================

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { ShopifyClient } from '@/lib/integrations/shopify';
import { syncContactFromShopify, updateContactOrderStats } from '../contact-sync';
import { createOrUpdateDealForContact } from '../deal-sync';
import type { ShopifyStoreConfig, ShopifyCustomer, ShopifyOrder } from '../types';

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
 * - Verifica se todos os webhooks estão registrados
 * - Verifica se as URLs estão corretas
 * - Re-registra webhooks faltantes ou com URL errada
 */
export async function checkWebhookHealth(): Promise<{
  storesChecked: number;
  webhooksFixed: number;
  webhooksCreated: number;
  errors: number;
  details: any[];
}> {
  console.log('========================================');
  console.log('🔍 VERIFICANDO WEBHOOKS...');
  console.log('========================================');
  
  const result = {
    storesChecked: 0,
    webhooksFixed: 0,
    webhooksCreated: 0,
    errors: 0,
    details: [] as any[],
  };
  
  const { data: stores, error: storesError } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('is_active', true);
  
  if (storesError) {
    console.error('❌ Erro ao buscar lojas:', storesError);
    result.details.push({ error: 'Failed to fetch stores', message: storesError.message });
    return result;
  }
  
  if (!stores?.length) {
    console.log('⚠️ Nenhuma loja ativa encontrada');
    result.details.push({ warning: 'No active stores found' });
    return result;
  }
  
  console.log(`📦 ${stores.length} loja(s) encontrada(s)`);
  
  // URL correta para webhooks
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  const correctWebhookUrl = `${baseUrl}/api/webhooks/shopify`;
  
  console.log(`🔗 URL dos webhooks: ${correctWebhookUrl}`);
  
  if (!baseUrl) {
    console.error('❌ NEXT_PUBLIC_APP_URL não configurado!');
    result.details.push({ error: 'NEXT_PUBLIC_APP_URL not configured' });
    result.errors++;
    return result;
  }
  
  // Webhooks necessários
  const requiredTopics = [
    'customers/create',
    'customers/update',
    'orders/create',
    'orders/paid',
    'orders/fulfilled',
    'orders/cancelled',
    'checkouts/create',
    'checkouts/update',
  ];
  
  for (const store of stores) {
    console.log('----------------------------------------');
    console.log(`🏪 Processando: ${store.shop_domain}`);
    
    const storeDetail: any = {
      shop_domain: store.shop_domain,
      webhooks_before: 0,
      webhooks_created: [],
      webhooks_deleted: [],
      errors: [],
    };
    
    result.storesChecked++;
    
    if (!store.access_token) {
      console.error(`❌ Loja sem access_token: ${store.shop_domain}`);
      storeDetail.errors.push('No access token');
      result.details.push(storeDetail);
      continue;
    }
    
    // 1. Buscar webhooks existentes usando fetch direto
    let existingWebhooks: any[] = [];
    try {
      console.log(`   Buscando webhooks existentes...`);
      const listResponse = await fetch(
        `https://${store.shop_domain}/admin/api/2026-04/webhooks.json`,
        {
          headers: {
            'X-Shopify-Access-Token': store.access_token,
          },
        }
      );
      
      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error(`   ❌ Erro ao listar webhooks (${listResponse.status}):`, errorText);
        storeDetail.errors.push(`List webhooks failed: ${listResponse.status} - ${errorText}`);
        result.errors++;
        result.details.push(storeDetail);
        continue;
      }
      
      const listData = await listResponse.json();
      existingWebhooks = listData.webhooks || [];
      storeDetail.webhooks_before = existingWebhooks.length;
      console.log(`   ✓ ${existingWebhooks.length} webhooks encontrados`);
      
    } catch (e: any) {
      console.error(`   ❌ Exceção ao listar webhooks:`, e.message);
      storeDetail.errors.push(`Exception listing webhooks: ${e.message}`);
      result.errors++;
      result.details.push(storeDetail);
      continue;
    }
    
    // 2. Deletar webhooks com URL errada
    for (const webhook of existingWebhooks) {
      if (webhook.address !== correctWebhookUrl) {
        console.log(`   🗑️ Deletando webhook com URL errada: ${webhook.topic} -> ${webhook.address}`);
        try {
          const deleteResponse = await fetch(
            `https://${store.shop_domain}/admin/api/2026-04/webhooks/${webhook.id}.json`,
            {
              method: 'DELETE',
              headers: {
                'X-Shopify-Access-Token': store.access_token,
              },
            }
          );
          
          if (deleteResponse.ok || deleteResponse.status === 404) {
            storeDetail.webhooks_deleted.push(webhook.topic);
            result.webhooksFixed++;
            console.log(`   ✓ Deletado: ${webhook.topic}`);
          } else {
            const errText = await deleteResponse.text();
            console.error(`   ❌ Falha ao deletar: ${errText}`);
            storeDetail.errors.push(`Delete ${webhook.topic} failed: ${errText}`);
          }
        } catch (e: any) {
          console.error(`   ❌ Exceção ao deletar:`, e.message);
          storeDetail.errors.push(`Delete exception: ${e.message}`);
        }
      }
    }
    
    // 3. Verificar quais webhooks estão faltando
    const correctWebhooks = existingWebhooks.filter(w => w.address === correctWebhookUrl);
    const registeredTopics = correctWebhooks.map(w => w.topic);
    const missingTopics = requiredTopics.filter(t => !registeredTopics.includes(t));
    
    console.log(`   📋 Webhooks OK: ${registeredTopics.length}, Faltando: ${missingTopics.length}`);
    
    // 4. Criar webhooks faltantes
    for (const topic of missingTopics) {
      console.log(`   ➕ Criando webhook: ${topic}`);
      try {
        const createResponse = await fetch(
          `https://${store.shop_domain}/admin/api/2026-04/webhooks.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': store.access_token,
            },
            body: JSON.stringify({
              webhook: {
                topic,
                address: correctWebhookUrl,
                format: 'json',
              },
            }),
          }
        );
        
        const createData = await createResponse.json();
        
        if (createResponse.ok) {
          storeDetail.webhooks_created.push(topic);
          result.webhooksCreated++;
          console.log(`   ✓ Criado: ${topic}`);
        } else {
          const errorMsg = JSON.stringify(createData.errors || createData);
          // Já existe não é erro
          if (errorMsg.includes('already') || errorMsg.includes('taken')) {
            console.log(`   ⚠️ Já existe: ${topic}`);
          } else {
            console.error(`   ❌ Falha ao criar ${topic}:`, errorMsg);
            storeDetail.errors.push(`Create ${topic} failed: ${errorMsg}`);
            result.errors++;
          }
        }
      } catch (e: any) {
        console.error(`   ❌ Exceção ao criar ${topic}:`, e.message);
        storeDetail.errors.push(`Create ${topic} exception: ${e.message}`);
        result.errors++;
      }
    }
    
    // 5. Atualizar status da loja
    await supabase
      .from('shopify_stores')
      .update({
        connection_status: storeDetail.errors.length === 0 ? 'active' : 'error',
        health_checked_at: new Date().toISOString(),
        consecutive_failures: storeDetail.errors.length,
        status_message: storeDetail.errors.length > 0 ? storeDetail.errors.join('; ') : null,
      })
      .eq('id', store.id);
    
    result.details.push(storeDetail);
    
    console.log(`   📊 Resultado: ${storeDetail.webhooks_created.length} criados, ${storeDetail.webhooks_deleted.length} deletados, ${storeDetail.errors.length} erros`);
  }
  
  console.log('========================================');
  console.log('🔍 VERIFICAÇÃO CONCLUÍDA');
  console.log(`   Lojas: ${result.storesChecked}`);
  console.log(`   Webhooks criados: ${result.webhooksCreated}`);
  console.log(`   Webhooks corrigidos: ${result.webhooksFixed}`);
  console.log(`   Erros: ${result.errors}`);
  console.log('========================================');
  
  return result;
}

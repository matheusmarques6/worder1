// =============================================
// Shopify Deal Sync Service
// src/lib/services/shopify/deal-sync.ts
// =============================================

import { createClient } from '@supabase/supabase-js';
import type { 
  ShopifyStoreConfig, 
  DealSyncResult,
  StageEventType 
} from './types';

// Supabase client com service role para operações de backend
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Cria ou atualiza deal para um contato baseado em evento do Shopify
 */
export async function createOrUpdateDealForContact(
  contactId: string,
  store: ShopifyStoreConfig,
  eventType: StageEventType,
  orderValue?: number,
  metadata?: Record<string, any>
): Promise<DealSyncResult> {
  
  // Se não tem pipeline configurado, não criar deal
  if (!store.default_pipeline_id) {
    console.log('No default pipeline configured, skipping deal creation');
    return { id: '', isNew: false, action: 'skipped' };
  }
  
  // 1. Determinar estágio baseado no evento
  const stageId = getStageForEvent(store, eventType);
  
  if (!stageId) {
    console.log(`No stage configured for event ${eventType}, using default`);
  }
  
  const targetStageId = stageId || store.default_stage_id;
  
  if (!targetStageId) {
    console.log('No stage available, skipping deal creation');
    return { id: '', isNew: false, action: 'skipped' };
  }
  
  // 2. Buscar deal existente para este contato neste pipeline
  const { data: existingDeal } = await supabase
    .from('deals')
    .select('*')
    .eq('contact_id', contactId)
    .eq('pipeline_id', store.default_pipeline_id)
    .eq('status', 'open') // Só deals abertos
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (existingDeal) {
    // 3a. Atualizar deal existente
    return await updateExistingDeal(existingDeal, targetStageId, orderValue, metadata);
  } else {
    // 3b. Criar novo deal
    return await createNewDeal(
      contactId,
      store,
      targetStageId,
      eventType,
      orderValue,
      metadata
    );
  }
}

/**
 * Atualiza deal existente
 */
async function updateExistingDeal(
  deal: any,
  stageId: string,
  orderValue?: number,
  metadata?: Record<string, any>
): Promise<DealSyncResult> {
  
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  
  // Mover para novo estágio se diferente
  const stageMoved = deal.stage_id !== stageId;
  if (stageMoved) {
    updateData.stage_id = stageId;
  }
  
  // Somar valor do pedido se houver
  if (orderValue && orderValue > 0) {
    updateData.value = (deal.value || 0) + orderValue;
  }
  
  // Merge metadata
  if (metadata) {
    updateData.metadata = {
      ...(deal.metadata || {}),
      ...metadata,
      last_updated_from_shopify: new Date().toISOString(),
    };
  }
  
  const { error } = await supabase
    .from('deals')
    .update(updateData)
    .eq('id', deal.id);
  
  if (error) {
    console.error('Failed to update deal:', error);
    throw error;
  }
  
  console.log(`✅ Deal updated: ${deal.title}${stageMoved ? ' (stage moved)' : ''}`);
  
  return {
    id: deal.id,
    isNew: false,
    action: stageMoved ? 'moved' : 'updated',
    stage_id: stageId,
  };
}

/**
 * Cria novo deal
 */
async function createNewDeal(
  contactId: string,
  store: ShopifyStoreConfig,
  stageId: string,
  eventType: StageEventType,
  orderValue?: number,
  metadata?: Record<string, any>
): Promise<DealSyncResult> {
  
  // Buscar nome do contato para título do deal
  const { data: contact } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', contactId)
    .single();
  
  const contactName = contact?.name || 'Cliente';
  const title = buildDealTitle(contactName, eventType, metadata);
  
  const { data: newDeal, error } = await supabase
    .from('deals')
    .insert({
      organization_id: store.organization_id,
      contact_id: contactId,
      pipeline_id: store.default_pipeline_id,
      stage_id: stageId,
      title,
      value: orderValue || 0,
      status: 'open',
      source: 'shopify',
      metadata: {
        ...metadata,
        shopify_store: store.shop_domain,
        created_from_event: eventType,
        created_at: new Date().toISOString(),
      },
    })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to create deal:', error);
    throw error;
  }
  
  console.log(`✅ Deal created: ${title} - R$ ${orderValue || 0}`);
  
  return {
    id: newDeal.id,
    isNew: true,
    action: 'created',
    stage_id: stageId,
  };
}

/**
 * Move deal para um novo estágio
 */
export async function moveDealToStage(
  contactId: string,
  store: ShopifyStoreConfig,
  eventType: StageEventType
): Promise<void> {
  
  const stageId = getStageForEvent(store, eventType);
  if (!stageId) return;
  
  // Buscar deal aberto do contato neste pipeline
  const { data: deal } = await supabase
    .from('deals')
    .select('id, stage_id')
    .eq('contact_id', contactId)
    .eq('pipeline_id', store.default_pipeline_id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (!deal) return;
  
  // Se já está no estágio correto, não fazer nada
  if (deal.stage_id === stageId) return;
  
  // Mover para novo estágio
  const { error } = await supabase
    .from('deals')
    .update({ 
      stage_id: stageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deal.id);
  
  if (error) {
    console.error('Failed to move deal:', error);
  } else {
    console.log(`✅ Deal moved to stage for event: ${eventType}`);
  }
}

/**
 * Marca deal como ganho (quando pedido é pago)
 */
export async function markDealAsWon(
  contactId: string,
  store: ShopifyStoreConfig,
  metadata?: Record<string, any>
): Promise<void> {
  
  // Buscar deal aberto do contato
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('contact_id', contactId)
    .eq('pipeline_id', store.default_pipeline_id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (!deal) return;
  
  // Mover para estágio de "pago" se configurado
  const paidStageId = store.stage_mapping?.paid;
  
  const updateData: Record<string, any> = {
    status: 'won',
    won_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  if (paidStageId) {
    updateData.stage_id = paidStageId;
  }
  
  if (metadata) {
    const { data: currentDeal } = await supabase
      .from('deals')
      .select('metadata')
      .eq('id', deal.id)
      .single();
    
    updateData.metadata = {
      ...(currentDeal?.metadata || {}),
      ...metadata,
    };
  }
  
  const { error } = await supabase
    .from('deals')
    .update(updateData)
    .eq('id', deal.id);
  
  if (error) {
    console.error('Failed to mark deal as won:', error);
  } else {
    console.log(`✅ Deal marked as won`);
  }
}

/**
 * Cria deal para carrinho abandonado
 */
export async function createAbandonedCartDeal(
  contactId: string,
  store: ShopifyStoreConfig,
  checkoutValue: number,
  recoveryUrl: string,
  checkoutId: string
): Promise<DealSyncResult> {
  
  const stageId = store.stage_mapping?.abandoned_cart || store.default_stage_id;
  
  if (!stageId || !store.default_pipeline_id) {
    return { id: '', isNew: false, action: 'skipped' };
  }
  
  return createOrUpdateDealForContact(
    contactId,
    store,
    'abandoned_cart',
    checkoutValue,
    {
      checkout_id: checkoutId,
      recovery_url: recoveryUrl,
      abandoned_at: new Date().toISOString(),
    }
  );
}

// =============================================
// Helper Functions
// =============================================

/**
 * Obtém ID do estágio para um tipo de evento
 */
function getStageForEvent(
  store: ShopifyStoreConfig,
  eventType: StageEventType
): string | null {
  const mapping = store.stage_mapping || {};
  return mapping[eventType] || null;
}

/**
 * Constrói título do deal
 */
function buildDealTitle(
  contactName: string,
  eventType: StageEventType,
  metadata?: Record<string, any>
): string {
  switch (eventType) {
    case 'new_order':
      const orderNumber = metadata?.order_number || metadata?.shopify_order_id;
      return orderNumber ? `Pedido #${orderNumber}` : `${contactName} - Pedido`;
      
    case 'abandoned_cart':
      return `${contactName} - Carrinho Abandonado`;
      
    case 'new_customer':
      return `${contactName} - Novo Cliente`;
      
    default:
      return `${contactName} - Shopify`;
  }
}

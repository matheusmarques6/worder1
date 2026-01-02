// =============================================
// Shopify Contact Sync Service
// src/lib/services/shopify/contact-sync.ts
//
// CORRIGIDO: Usa campos corretos da tabela contacts
// - first_name, last_name (não 'name')
// - shopify_customer_id (não 'metadata.shopify_id')
// - custom_fields (não 'metadata')
// - total_orders, total_spent (campos reais)
//
// NOVO: Proteção contra duplicação com retry e upsert
// =============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { 
  ShopifyStoreConfig, 
  ShopifyCustomer, 
  ContactSyncResult,
  ShopifyEventType 
} from './types';

// Supabase client getter para evitar problemas de inicialização
function getSupabase() {
  return getSupabaseAdmin();
}

/**
 * Sincroniza um cliente do Shopify com o CRM
 * Cria novo contato ou atualiza existente baseado em email/telefone
 * 
 * PROTEÇÃO CONTRA DUPLICAÇÃO:
 * 1. Usa retry com backoff para lidar com race conditions
 * 2. Verifica duplicata após erro de inserção
 * 3. Busca por múltiplos identificadores
 */
export async function syncContactFromShopify(
  customer: Partial<ShopifyCustomer>,
  store: ShopifyStoreConfig,
  eventType: ShopifyEventType,
  retryCount: number = 0
): Promise<ContactSyncResult> {
  
  const MAX_RETRIES = 3;
  const supabase = getSupabase();
  
  // 1. Normalizar dados do cliente
  const firstName = customer.first_name?.trim() || '';
  const lastName = customer.last_name?.trim() || '';
  const email = customer.email?.toLowerCase().trim() || null;
  const phone = normalizePhone(customer.phone);
  
  // Se não tem email nem telefone, não podemos criar contato
  if (!email && !phone) {
    throw new Error('Customer has no email or phone');
  }
  
  try {
    // 2. Buscar contato existente por email, telefone ou shopify_customer_id
    let existingContact = await findExistingContact(
      supabase,
      store.organization_id, 
      email, 
      phone,
      customer.id ? String(customer.id) : null
    );
    
    // 3. Preparar tags
    const tags = buildTags(store.auto_tags, eventType, existingContact?.tags);
    
    // 4. Criar ou atualizar contato
    if (existingContact) {
      const result = await updateExistingContact(
        supabase,
        existingContact,
        { firstName, lastName, email, phone, tags },
        store,
        customer,
        eventType
      );
      return result;
    } else {
      const result = await createNewContact(
        supabase,
        { firstName, lastName, email, phone, tags },
        store,
        customer
      );
      return result;
    }
  } catch (error: any) {
    // 5. PROTEÇÃO: Se erro de duplicata (unique violation), tentar novamente
    const isDuplicateError = 
      error?.code === '23505' || // PostgreSQL unique violation
      error?.message?.includes('duplicate') ||
      error?.message?.includes('unique constraint');
    
    if (isDuplicateError && retryCount < MAX_RETRIES) {
      console.log(`[ContactSync] Duplicate detected, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
      
      // Aguardar um pouco antes de tentar novamente (backoff exponencial)
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
      
      // Tentar novamente - dessa vez vai encontrar o contato existente
      return syncContactFromShopify(customer, store, eventType, retryCount + 1);
    }
    
    // Se não é erro de duplicata ou excedeu retries, propagar erro
    throw error;
  }
}

/**
 * Busca contato existente por email, telefone ou shopify_customer_id
 * MELHORADO: Busca mais abrangente e robusta
 */
async function findExistingContact(
  supabase: SupabaseClient,
  organizationId: string,
  email: string | null,
  phone: string | null,
  shopifyCustomerId: string | null
): Promise<any | null> {
  
  // Primeiro tentar por shopify_customer_id (mais específico)
  if (shopifyCustomerId) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('shopify_customer_id', shopifyCustomerId)
      .maybeSingle();
    
    if (data) return data;
  }
  
  // Depois tentar por email (case insensitive)
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    
    if (data) return data;
  }
  
  // Por fim tentar por telefone (com variações)
  if (phone) {
    // Tentar telefone exato
    const { data: exactMatch } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    
    if (exactMatch) return exactMatch;
    
    // Tentar sem o prefixo +55
    const phoneWithout55 = phone.replace(/^\+55/, '');
    if (phoneWithout55 !== phone) {
      const { data: without55 } = await supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId)
        .or(`phone.eq.${phoneWithout55},phone.eq.+${phoneWithout55}`)
        .limit(1)
        .maybeSingle();
      
      if (without55) return without55;
    }
    
    // Tentar também no campo whatsapp
    const { data: whatsappMatch } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('whatsapp', phone)
      .limit(1)
      .maybeSingle();
    
    if (whatsappMatch) return whatsappMatch;
  }
  
  return null;
}

/**
 * Constrói tags para o contato
 */
function buildTags(
  autoTags: string[],
  eventType: ShopifyEventType,
  existingTags?: string[]
): string[] {
  const baseTags = autoTags || ['shopify'];
  
  // Tags específicas por evento
  const eventTags: string[] = [];
  switch (eventType) {
    case 'order':
    case 'order_paid':
      eventTags.push('comprador');
      break;
    case 'checkout':
      eventTags.push('checkout');
      break;
  }
  
  // Combinar todas as tags (sem duplicatas)
  const allTags = [
    ...(existingTags || []),
    ...baseTags,
    ...eventTags,
  ];
  
  return [...new Set(allTags)];
}

/**
 * Atualiza contato existente
 */
async function updateExistingContact(
  supabase: SupabaseClient,
  existingContact: any,
  data: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    tags: string[];
  },
  store: ShopifyStoreConfig,
  customer: Partial<ShopifyCustomer>,
  eventType: ShopifyEventType
): Promise<ContactSyncResult> {
  
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  
  // Atualizar nome se estava vazio
  if (!existingContact.first_name && data.firstName) {
    updateData.first_name = data.firstName;
  }
  if (!existingContact.last_name && data.lastName) {
    updateData.last_name = data.lastName;
  }
  
  // Atualizar telefone se estava vazio
  if (!existingContact.phone && data.phone) {
    updateData.phone = data.phone;
    updateData.whatsapp = data.phone; // Também salvar como whatsapp
  }
  
  // Atualizar email se estava vazio
  if (!existingContact.email && data.email) {
    updateData.email = data.email;
  }
  
  // Atualizar shopify_customer_id se não tinha
  if (!existingContact.shopify_customer_id && customer.id) {
    updateData.shopify_customer_id = String(customer.id);
  }
  
  // Atualizar tags (merge)
  updateData.tags = data.tags;
  
  // Atualizar custom_fields com dados do Shopify
  const existingCustomFields = existingContact.custom_fields || {};
  updateData.custom_fields = {
    ...existingCustomFields,
    shopify_store: store.shop_domain,
    last_shopify_sync: new Date().toISOString(),
    last_shopify_event: eventType,
    accepts_marketing: customer.accepts_marketing ?? existingCustomFields.accepts_marketing,
  };
  
  // Executar update
  const { error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', existingContact.id);
  
  if (error) {
    console.error('[ContactSync] Failed to update contact:', error);
    throw error;
  }
  
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ') || 
                   existingContact.full_name || 
                   existingContact.email;
  
  console.log(`[ContactSync] ✅ Contact updated: ${fullName}`);
  
  return {
    id: existingContact.id,
    isNew: false,
    name: fullName,
    type: 'customer',
    wasConverted: false,
  };
}

/**
 * Cria novo contato
 */
async function createNewContact(
  supabase: SupabaseClient,
  data: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    tags: string[];
  },
  store: ShopifyStoreConfig,
  customer: Partial<ShopifyCustomer>
): Promise<ContactSyncResult> {
  
  // Dados iniciais do contato
  // IMPORTANTE: Não usar customer.orders_count nem total_spent do Shopify
  // Esses valores serão incrementados por updateContactOrderStats() a cada pedido
  const contactData: Record<string, any> = {
    organization_id: store.organization_id,
    first_name: data.firstName || null,
    last_name: data.lastName || null,
    email: data.email,
    phone: data.phone,
    whatsapp: data.phone, // Também salvar como whatsapp
    source: 'shopify',
    shopify_customer_id: customer.id ? String(customer.id) : null,
    tags: data.tags,
    total_orders: 0, // Começa em 0, será incrementado por updateContactOrderStats
    total_spent: 0,  // Começa em 0, será incrementado por updateContactOrderStats
    average_order_value: 0,
    lifetime_value: 0,
    is_subscribed_email: customer.accepts_marketing ?? true,
    is_subscribed_sms: false,
    is_subscribed_whatsapp: true,
    custom_fields: {
      shopify_store: store.shop_domain,
      created_from_shopify: true,
      shopify_created_at: customer.created_at,
      accepts_marketing: customer.accepts_marketing ?? false,
      // Guardar valores originais do Shopify para referência
      shopify_orders_count: customer.orders_count || 0,
      shopify_total_spent: customer.total_spent || '0',
    },
  };
  
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert(contactData)
    .select()
    .single();
  
  if (error) {
    console.error('[ContactSync] Failed to create contact:', error);
    throw error;
  }
  
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ') || data.email || data.phone;
  console.log(`[ContactSync] ✅ Contact created: ${fullName}`);
  
  return {
    id: newContact.id,
    isNew: true,
    name: fullName || '',
    type: 'customer',
    wasConverted: false,
  };
}

/**
 * Atualiza estatísticas do contato após um pedido
 * CORRIGIDO: Usa campos reais da tabela (total_orders, total_spent, etc)
 */
export async function updateContactOrderStats(
  contactId: string,
  orderValue: number
): Promise<void> {
  
  const supabase = getSupabase();
  
  // Buscar contato atual
  const { data: contact } = await supabase
    .from('contacts')
    .select('total_orders, total_spent, average_order_value')
    .eq('id', contactId)
    .single();
  
  if (!contact) return;
  
  const currentTotal = parseFloat(contact.total_spent) || 0;
  const currentOrders = contact.total_orders || 0;
  const newTotalOrders = currentOrders + 1;
  const newTotalSpent = currentTotal + orderValue;
  const newAverageValue = newTotalSpent / newTotalOrders;
  
  // Atualizar campos reais
  const { error } = await supabase
    .from('contacts')
    .update({
      total_orders: newTotalOrders,
      total_spent: newTotalSpent,
      average_order_value: newAverageValue,
      lifetime_value: newTotalSpent,
      last_order_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);
  
  if (error) {
    console.error('[ContactSync] Failed to update contact stats:', error);
  } else {
    console.log(`[ContactSync] ✅ Stats updated: orders=${newTotalOrders}, spent=${newTotalSpent}`);
  }
}

/**
 * Adiciona tag de carrinho abandonado ao contato
 */
export async function addAbandonedCartTag(contactId: string): Promise<void> {
  const supabase = getSupabase();
  
  const { data: contact } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', contactId)
    .single();
  
  if (!contact) return;
  
  const tags = contact.tags || [];
  if (!tags.includes('carrinho-abandonado')) {
    tags.push('carrinho-abandonado');
    
    await supabase
      .from('contacts')
      .update({ tags, updated_at: new Date().toISOString() })
      .eq('id', contactId);
      
    console.log(`[ContactSync] ✅ Added abandoned cart tag to contact ${contactId}`);
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Normaliza número de telefone para formato padrão
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remover tudo exceto números e +
  let digits = phone.replace(/[^\d+]/g, '');
  
  // Se começar com +, manter
  const hasPlus = digits.startsWith('+');
  digits = digits.replace(/\D/g, '');
  
  // Se muito curto, ignorar
  if (digits.length < 8) return null;
  
  // Se começar com 55 (Brasil) e tiver tamanho correto
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }
  
  // Se tiver 10-11 dígitos, assumir Brasil
  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`;
  }
  
  // Outros casos, adicionar + se não tiver
  return hasPlus ? `+${digits}` : `+${digits}`;
}

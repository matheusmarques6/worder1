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
    // 2. Buscar contato existente por email, telefone ou
    //    shopify_customer_id. Multi-store orgs (Dr. Melaxin + Based
    //    com o mesmo organization_id) tinham um bug silencioso aqui:
    //    se foo@bar.com existisse em Dr. Melaxin, qualquer ordem do
    //    Based com o mesmo email atualizava o contato da loja A em
    //    vez de criar um novo pra B. Agora a busca prefere a mesma
    //    store antes de cair pro org-scope.
    let existingContact = await findExistingContact(
      supabase,
      store.organization_id,
      store.id,
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
 * Busca contato existente por email, telefone ou shopify_customer_id.
 *
 * Multi-store aware: cada lookup tenta primeiro com store_id da loja
 * inbound, depois cai pro org-scope. Isso impede que customer foo@bar
 * vindo de Based "roube" o contato que já existia pra Dr. Melaxin —
 * o que fazia eventos, total_orders, e total_spent de Based ficarem
 * gravados no contato errado da loja irmã.
 */
async function findExistingContact(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string,
  email: string | null,
  phone: string | null,
  shopifyCustomerId: string | null
): Promise<any | null> {

  // Helper: roda uma query no scope same-store primeiro, depois
  // org-wide. Retorna o primeiro match.
  const lookupScoped = async (
    apply: (q: any) => any,
  ): Promise<any | null> => {
    // 1. Same-store match (preferido)
    const sameStoreQuery = apply(
      supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('store_id', storeId)
    ).limit(1).maybeSingle();
    const { data: same } = await sameStoreQuery;
    if (same) return same;
    // 2. Same store but NULL store_id (legacy contacts criados antes
    //    do strict store_id existir). Backfill é feito em update.
    const nullStoreQuery = apply(
      supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId)
        .is('store_id', null)
    ).limit(1).maybeSingle();
    const { data: legacy } = await nullStoreQuery;
    if (legacy) return legacy;
    // 3. Org-wide fallback (qualquer store). Última tentativa pra
    //    não criar duplicata se o merchant migrou um contato manual.
    const orgQuery = apply(
      supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId)
    ).limit(1).maybeSingle();
    const { data: anyStore } = await orgQuery;
    return anyStore || null;
  };

  // Primeiro tentar por shopify_customer_id (mais específico — IDs
  // são únicos por store no Shopify, então same-store ganha sempre).
  if (shopifyCustomerId) {
    const match = await lookupScoped((q) => q.eq('shopify_customer_id', shopifyCustomerId));
    if (match) return match;
  }

  // Depois por email (case insensitive)
  if (email) {
    const match = await lookupScoped((q) => q.ilike('email', email));
    if (match) return match;
  }

  // Por fim por telefone — telefone exato, sem +55, e no campo whatsapp.
  if (phone) {
    const exactMatch = await lookupScoped((q) => q.eq('phone', phone));
    if (exactMatch) return exactMatch;

    const phoneWithout55 = phone.replace(/^\+55/, '');
    if (phoneWithout55 !== phone) {
      const without55Match = await lookupScoped((q) =>
        q.or(`phone.eq.${phoneWithout55},phone.eq.+${phoneWithout55}`)
      );
      if (without55Match) return without55Match;
    }

    const whatsappMatch = await lookupScoped((q) => q.eq('whatsapp', phone));
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

  // Backfill store_id em contatos legacy (criados antes do strict
  // multi-store. Sem isso, queries store-scoped continuam excluindo
  // esses contatos pra sempre.
  if (!existingContact.store_id) {
    updateData.store_id = store.id;
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
    store_id: store.id, // ✅ CRÍTICO: Salvar store_id para multi-tenant
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

  // Backfill: any automation_runs created with contact_id=null because
  // this contact didn't exist yet (race between checkout webhook and
  // contact sync) get linked now. Without this, the History panel keeps
  // showing "Sem contato" forever for those waiting runs.
  if (data.email && newContact?.id) {
    try {
      await supabase
        .from('automation_runs')
        .update({ contact_id: newContact.id })
        .eq('organization_id', store.organization_id)
        .is('contact_id', null)
        .or(`metadata->trigger_data->>CustomerEmail.eq.${data.email},metadata->trigger_data->>email.eq.${data.email}`);
    } catch (e) {
      console.warn('[ContactSync] backfill automation_runs failed:', e);
    }
  }

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

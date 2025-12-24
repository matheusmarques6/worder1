// =============================================
// Shopify Contact Sync Service
// src/lib/services/shopify/contact-sync.ts
// =============================================

import { createClient } from '@supabase/supabase-js';
import type { 
  ShopifyStoreConfig, 
  ShopifyCustomer, 
  ContactSyncResult,
  ShopifyEventType 
} from './types';

// Supabase client com service role para operações de backend
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Sincroniza um cliente do Shopify com o CRM
 * Cria novo contato ou atualiza existente baseado em email/telefone
 */
export async function syncContactFromShopify(
  customer: Partial<ShopifyCustomer>,
  store: ShopifyStoreConfig,
  eventType: ShopifyEventType
): Promise<ContactSyncResult> {
  
  // 1. Normalizar dados do cliente
  const name = buildCustomerName(customer);
  const email = customer.email?.toLowerCase().trim() || null;
  const phone = normalizePhone(customer.phone);
  
  // Se não tem email nem telefone, não podemos criar contato
  if (!email && !phone) {
    throw new Error('Customer has no email or phone');
  }
  
  // 2. Buscar contato existente por email ou telefone
  let existingContact = await findExistingContact(store.organization_id, email, phone);
  
  // 3. Determinar tipo de contato baseado na configuração
  const contactType = determineContactType(store, eventType, customer.orders_count);
  
  // 4. Preparar tags
  const tags = buildTags(store.auto_tags, eventType, existingContact?.tags);
  
  // 5. Criar ou atualizar contato
  if (existingContact) {
    const result = await updateExistingContact(
      existingContact,
      { name, email, phone, tags, contactType },
      store,
      customer,
      eventType
    );
    return result;
  } else {
    const result = await createNewContact(
      { name, email, phone, tags, contactType },
      store,
      customer
    );
    return result;
  }
}

/**
 * Busca contato existente por email ou telefone
 */
async function findExistingContact(
  organizationId: string,
  email: string | null,
  phone: string | null
): Promise<any | null> {
  
  // Primeiro tentar por email
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .maybeSingle();
    
    if (data) return data;
  }
  
  // Depois tentar por telefone
  if (phone) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('phone', phone)
      .maybeSingle();
    
    if (data) return data;
  }
  
  return null;
}

/**
 * Determina o tipo de contato baseado na configuração da loja
 */
function determineContactType(
  store: ShopifyStoreConfig,
  eventType: ShopifyEventType,
  ordersCount?: number
): 'lead' | 'customer' {
  
  switch (store.contact_type) {
    case 'lead':
      return 'lead';
      
    case 'customer':
      return 'customer';
      
    case 'auto':
    default:
      // Automático baseado no evento
      if (eventType === 'order' || eventType === 'order_paid' || eventType === 'order_fulfilled') {
        return 'customer'; // Comprou = customer
      }
      if (eventType === 'checkout') {
        return 'lead'; // Carrinho = lead (ainda não comprou)
      }
      // Para customers/create, verificar se já tem pedidos
      return (ordersCount || 0) > 0 ? 'customer' : 'lead';
  }
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
  existingContact: any,
  data: {
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[];
    contactType: 'lead' | 'customer';
  },
  store: ShopifyStoreConfig,
  customer: Partial<ShopifyCustomer>,
  eventType: ShopifyEventType
): Promise<ContactSyncResult> {
  
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  
  // Atualizar nome se estava vazio ou era genérico
  if (!existingContact.name || existingContact.name === 'Cliente Shopify') {
    updateData.name = data.name;
  }
  
  // Atualizar telefone se estava vazio
  if (!existingContact.phone && data.phone) {
    updateData.phone = data.phone;
  }
  
  // Atualizar email se estava vazio
  if (!existingContact.email && data.email) {
    updateData.email = data.email;
  }
  
  // Verificar se precisa converter lead -> customer
  let wasConverted = false;
  if (existingContact.type === 'lead' && data.contactType === 'customer') {
    updateData.type = 'customer';
    wasConverted = true;
  }
  
  // Atualizar tags (merge)
  updateData.tags = data.tags;
  
  // Atualizar metadata do Shopify
  const existingMetadata = existingContact.metadata || {};
  updateData.metadata = {
    ...existingMetadata,
    shopify_id: customer.id ? String(customer.id) : existingMetadata.shopify_id,
    shopify_store: store.shop_domain,
    last_shopify_sync: new Date().toISOString(),
    last_shopify_event: eventType,
  };
  
  // Executar update
  const { error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', existingContact.id);
  
  if (error) {
    console.error('Failed to update contact:', error);
    throw error;
  }
  
  console.log(`✅ Contact updated: ${existingContact.email || existingContact.phone}${wasConverted ? ' (converted to customer)' : ''}`);
  
  return {
    id: existingContact.id,
    isNew: false,
    name: existingContact.name,
    type: updateData.type || existingContact.type,
    wasConverted,
  };
}

/**
 * Cria novo contato
 */
async function createNewContact(
  data: {
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[];
    contactType: 'lead' | 'customer';
  },
  store: ShopifyStoreConfig,
  customer: Partial<ShopifyCustomer>
): Promise<ContactSyncResult> {
  
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      organization_id: store.organization_id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      type: data.contactType,
      source: 'shopify',
      tags: data.tags,
      metadata: {
        shopify_id: customer.id ? String(customer.id) : null,
        shopify_store: store.shop_domain,
        created_from_shopify: true,
        orders_count: customer.orders_count || 0,
        total_spent: customer.total_spent || '0',
      },
    })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to create contact:', error);
    throw error;
  }
  
  console.log(`✅ Contact created: ${data.email || data.phone} as ${data.contactType}`);
  
  return {
    id: newContact.id,
    isNew: true,
    name: newContact.name,
    type: data.contactType,
    wasConverted: false,
  };
}

/**
 * Atualiza estatísticas do contato após um pedido
 */
export async function updateContactOrderStats(
  contactId: string,
  orderValue: number
): Promise<void> {
  
  // Buscar contato atual para somar valores
  const { data: contact } = await supabase
    .from('contacts')
    .select('metadata')
    .eq('id', contactId)
    .single();
  
  if (!contact) return;
  
  const metadata = contact.metadata || {};
  const currentTotal = parseFloat(metadata.total_spent || '0');
  const currentOrders = parseInt(metadata.orders_count || '0', 10);
  
  // Atualizar
  const { error } = await supabase
    .from('contacts')
    .update({
      type: 'customer', // Garantir que é customer após pedido
      metadata: {
        ...metadata,
        total_spent: String(currentTotal + orderValue),
        orders_count: currentOrders + 1,
        last_order_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);
  
  if (error) {
    console.error('Failed to update contact stats:', error);
  }
}

/**
 * Adiciona tag de carrinho abandonado ao contato
 */
export async function addAbandonedCartTag(contactId: string): Promise<void> {
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
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Constrói nome do cliente a partir dos dados
 */
function buildCustomerName(customer: Partial<ShopifyCustomer>): string {
  const parts = [
    customer.first_name,
    customer.last_name,
  ].filter(Boolean);
  
  return parts.join(' ').trim() || 'Cliente Shopify';
}

/**
 * Normaliza número de telefone para formato padrão
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remover tudo exceto números
  const digits = phone.replace(/\D/g, '');
  
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
  return `+${digits}`;
}

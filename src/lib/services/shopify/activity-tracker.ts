// =============================================
// Contact Activity Tracker Service
// src/lib/services/shopify/activity-tracker.ts
// 
// Registra atividades e enriquece dados do contato
// =============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function getSupabase(): SupabaseClient {
      
  return getSupabaseAdmin();
}

// =============================================
// Types
// =============================================

export type ActivityType = 
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_started'
  | 'order_placed'
  | 'order_paid'
  | 'order_fulfilled'
  | 'order_cancelled'
  | 'order_refunded'
  | 'email_sent'
  | 'email_opened'
  | 'whatsapp_sent'
  | 'whatsapp_received'
  | 'note'
  | 'call'
  | 'meeting';

export interface TrackActivityParams {
  organizationId: string;
  contactId?: string;
  email?: string;
  phone?: string;
  type: ActivityType;
  title?: string;
  description?: string;
  url?: string;
  metadata?: Record<string, any>;
  source?: string;
  sourceId?: string;
  occurredAt?: Date;
}

export interface TrackPurchaseParams {
  organizationId: string;
  contactId: string;
  orderId: string;
  orderNumber?: string;
  orderDate: Date;
  productId?: string;
  productTitle: string;
  productSku?: string;
  productVendor?: string;
  productType?: string;
  productImageUrl?: string;
  variantId?: string;
  variantTitle?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency?: string;
}

// =============================================
// Track Activity
// =============================================

export async function trackActivity(params: TrackActivityParams): Promise<string | null> {
  const supabase = getSupabase();
  
  try {
    // Se não tem contactId, tentar encontrar por email/phone
    let contactId = params.contactId;
    
    if (!contactId && (params.email || params.phone)) {
      const contact = await findContactByEmailOrPhone(
        supabase,
        params.organizationId,
        params.email,
        params.phone
      );
      contactId = contact?.id;
    }
    
    if (!contactId) {
      console.log('[ActivityTracker] No contact found, skipping');
      return null;
    }
    
    // Gerar título automático se não fornecido
    const title = params.title || generateActivityTitle(params.type, params.metadata);
    
    // Inserir atividade
    const { data, error } = await supabase
      .from('contact_activities')
      .insert({
        organization_id: params.organizationId,
        contact_id: contactId,
        type: params.type,
        title,
        description: params.description,
        url: params.url,
        metadata: params.metadata || {},
        source: params.source || 'shopify',
        source_id: params.sourceId,
        occurred_at: params.occurredAt || new Date(),
        created_at: new Date(),
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[ActivityTracker] Failed to track:', error);
      return null;
    }
    
    console.log(`[ActivityTracker] ✅ Tracked: ${params.type} for contact ${contactId}`);
    return data.id;
    
  } catch (err) {
    console.error('[ActivityTracker] Error:', err);
    return null;
  }
}

// =============================================
// Track Product Purchase
// =============================================

export async function trackPurchase(params: TrackPurchaseParams): Promise<void> {
  const supabase = getSupabase();
  
  try {
    // Verificar se já existe (evitar duplicata)
    const { data: existing } = await supabase
      .from('contact_purchases')
      .select('id')
      .eq('contact_id', params.contactId)
      .eq('order_id', params.orderId)
      .eq('product_id', params.productId || '')
      .maybeSingle();
    
    if (existing) {
      console.log('[ActivityTracker] Purchase already tracked, skipping');
      return;
    }
    
    await supabase.from('contact_purchases').insert({
      organization_id: params.organizationId,
      contact_id: params.contactId,
      order_id: params.orderId,
      order_number: params.orderNumber,
      order_date: params.orderDate,
      product_id: params.productId,
      product_title: params.productTitle,
      product_sku: params.productSku,
      product_vendor: params.productVendor,
      product_type: params.productType,
      product_image_url: params.productImageUrl,
      variant_id: params.variantId,
      variant_title: params.variantTitle,
      quantity: params.quantity,
      unit_price: params.unitPrice,
      total_price: params.totalPrice,
      currency: params.currency || 'BRL',
    });
    
    console.log(`[ActivityTracker] ✅ Purchase tracked: ${params.productTitle}`);
  } catch (err) {
    console.error('[ActivityTracker] Error tracking purchase:', err);
  }
}

// =============================================
// Enrich Contact from Order
// =============================================

export async function enrichContactFromOrder(
  contactId: string,
  order: {
    id: string;
    orderNumber?: string;
    totalPrice: number;
    lineItems: any[];
    createdAt: Date;
  }
): Promise<void> {
  const supabase = getSupabase();
  
  try {
    // Buscar dados atuais do contato
    const { data: contact } = await supabase
      .from('contacts')
      .select('total_orders, total_spent, first_order_at, favorite_products')
      .eq('id', contactId)
      .single();
    
    if (!contact) return;
    
    // Preparar produtos do pedido
    const orderProducts = (order.lineItems || []).map((item: any) => ({
      product_id: item.product_id?.toString(),
      title: item.title || item.name,
      sku: item.sku,
      quantity: item.quantity || 1,
      price: parseFloat(item.price || '0'),
      image_url: item.image?.src,
    }));
    
    // Calcular produtos favoritos
    const favoriteProducts = calculateFavoriteProducts(
      contact.favorite_products || [],
      orderProducts,
      order.createdAt
    );
    
    // Calcular frequência de pedidos
    const totalOrders = (contact.total_orders || 0) + 1;
    const firstOrderAt = contact.first_order_at || order.createdAt;
    let orderFrequencyDays = null;
    
    if (totalOrders > 1 && firstOrderAt) {
      const daysSinceFirst = Math.max(1, Math.floor(
        (order.createdAt.getTime() - new Date(firstOrderAt).getTime()) / (1000 * 60 * 60 * 24)
      ));
      orderFrequencyDays = daysSinceFirst / (totalOrders - 1);
    }
    
    // Atualizar contato
    const { error } = await supabase
      .from('contacts')
      .update({
        total_orders: totalOrders,
        total_spent: (parseFloat(contact.total_spent) || 0) + order.totalPrice,
        average_order_value: ((parseFloat(contact.total_spent) || 0) + order.totalPrice) / totalOrders,
        last_order_at: order.createdAt,
        last_order_id: order.id,
        last_order_value: order.totalPrice,
        last_order_number: order.orderNumber,
        last_order_products: orderProducts,
        first_order_at: contact.first_order_at || order.createdAt,
        order_frequency_days: orderFrequencyDays,
        favorite_products: favoriteProducts,
        updated_at: new Date(),
      })
      .eq('id', contactId);
    
    if (error) {
      console.error('[ActivityTracker] Failed to enrich contact:', error);
    } else {
      console.log(`[ActivityTracker] ✅ Contact enriched: ${contactId}`);
    }
    
  } catch (err) {
    console.error('[ActivityTracker] Error enriching contact:', err);
  }
}

// =============================================
// Helpers
// =============================================

async function findContactByEmailOrPhone(
  supabase: SupabaseClient,
  organizationId: string,
  email?: string,
  phone?: string
): Promise<{ id: string } | null> {
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .maybeSingle();
    
    if (data) return data;
  }
  
  if (phone) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', phone)
      .maybeSingle();
    
    if (data) return data;
  }
  
  return null;
}

function generateActivityTitle(type: ActivityType, metadata?: Record<string, any>): string {
  switch (type) {
    case 'page_view':
      return `Visitou página${metadata?.page_title ? `: ${metadata.page_title}` : ''}`;
    case 'product_view':
      return `Visualizou produto${metadata?.product_title ? `: ${metadata.product_title}` : ''}`;
    case 'add_to_cart':
      return `Adicionou ao carrinho${metadata?.product_title ? `: ${metadata.product_title}` : ''}`;
    case 'checkout_started':
      return `Iniciou checkout${metadata?.total ? ` - R$ ${metadata.total}` : ''}`;
    case 'order_placed':
      return `Fez pedido${metadata?.order_number ? ` #${metadata.order_number}` : ''}`;
    case 'order_paid':
      return `Pagamento confirmado${metadata?.order_number ? ` - Pedido #${metadata.order_number}` : ''}`;
    case 'order_fulfilled':
      return `Pedido enviado${metadata?.order_number ? ` #${metadata.order_number}` : ''}`;
    case 'order_cancelled':
      return `Pedido cancelado${metadata?.order_number ? ` #${metadata.order_number}` : ''}`;
    case 'order_refunded':
      return `Pedido reembolsado${metadata?.order_number ? ` #${metadata.order_number}` : ''}`;
    case 'email_sent':
      return `Email enviado${metadata?.subject ? `: ${metadata.subject}` : ''}`;
    case 'email_opened':
      return `Abriu email${metadata?.subject ? `: ${metadata.subject}` : ''}`;
    case 'whatsapp_sent':
      return `WhatsApp enviado`;
    case 'whatsapp_received':
      return `WhatsApp recebido`;
    default:
      return type.replace(/_/g, ' ');
  }
}

function calculateFavoriteProducts(
  existingFavorites: any[],
  newProducts: any[],
  orderDate: Date
): any[] {
  const productMap = new Map<string, { title: string; count: number; lastPurchase: Date }>();
  
  // Adicionar existentes
  for (const fav of existingFavorites) {
    if (fav.product_id) {
      productMap.set(fav.product_id, {
        title: fav.title,
        count: fav.count || 1,
        lastPurchase: new Date(fav.last_purchase),
      });
    }
  }
  
  // Adicionar novos
  for (const product of newProducts) {
    if (!product.product_id) continue;
    
    const existing = productMap.get(product.product_id);
    if (existing) {
      productMap.set(product.product_id, {
        title: product.title,
        count: existing.count + (product.quantity || 1),
        lastPurchase: orderDate,
      });
    } else {
      productMap.set(product.product_id, {
        title: product.title,
        count: product.quantity || 1,
        lastPurchase: orderDate,
      });
    }
  }
  
  // Ordenar por quantidade e pegar top 10
  return Array.from(productMap.entries())
    .map(([product_id, data]) => ({
      product_id,
      title: data.title,
      count: data.count,
      last_purchase: data.lastPurchase.toISOString(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

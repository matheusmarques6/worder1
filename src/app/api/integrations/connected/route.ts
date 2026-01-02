// =============================================
// Connected Integrations API
// src/app/api/integrations/connected/route.ts
//
// GET: Listar todas as integrações conectadas e validadas
//      para a organização (para usar na UI de automações)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return getSupabaseAdmin();
}

// Definição dos eventos disponíveis por integração
const INTEGRATION_EVENTS: Record<string, Array<{
  id: string;
  label: string;
  description: string;
  category: string;
}>> = {
  shopify: [
    { id: 'order_created', label: 'Pedido Criado', description: 'Quando um novo pedido é feito', category: 'Pedidos' },
    { id: 'order_paid', label: 'Pedido Pago', description: 'Quando pagamento é confirmado', category: 'Pedidos' },
    { id: 'order_fulfilled', label: 'Pedido Enviado', description: 'Quando pedido sai para entrega', category: 'Pedidos' },
    { id: 'order_delivered', label: 'Pedido Entregue', description: 'Quando cliente recebe o pedido', category: 'Pedidos' },
    { id: 'order_cancelled', label: 'Pedido Cancelado', description: 'Quando pedido é cancelado', category: 'Pedidos' },
    { id: 'checkout_abandoned', label: 'Carrinho Abandonado', description: 'Checkout não finalizado após 1h', category: 'Carrinho' },
    { id: 'customer_created', label: 'Novo Cliente', description: 'Primeiro cadastro do cliente', category: 'Clientes' },
  ],
  whatsapp: [
    { id: 'conversation_started', label: 'Nova Conversa', description: 'Cliente inicia uma nova conversa', category: 'Mensagens' },
    { id: 'message_received', label: 'Mensagem Recebida', description: 'Qualquer mensagem recebida', category: 'Mensagens' },
    { id: 'contact_created', label: 'Contato Criado', description: 'Novo contato salvo no sistema', category: 'Contatos' },
  ],
  hotmart: [
    { id: 'purchase_approved', label: 'Compra Aprovada', description: 'Venda confirmada', category: 'Vendas' },
    { id: 'purchase_refunded', label: 'Reembolso', description: 'Compra reembolsada', category: 'Vendas' },
    { id: 'subscription_started', label: 'Assinatura Iniciada', description: 'Nova assinatura ativa', category: 'Assinaturas' },
    { id: 'subscription_cancelled', label: 'Assinatura Cancelada', description: 'Assinatura cancelada', category: 'Assinaturas' },
  ],
  woocommerce: [
    { id: 'order_created', label: 'Pedido Criado', description: 'Quando um novo pedido é feito', category: 'Pedidos' },
    { id: 'order_paid', label: 'Pedido Pago', description: 'Quando pagamento é confirmado', category: 'Pedidos' },
    { id: 'order_completed', label: 'Pedido Concluído', description: 'Pedido finalizado', category: 'Pedidos' },
    { id: 'order_cancelled', label: 'Pedido Cancelado', description: 'Pedido cancelado', category: 'Pedidos' },
  ],
  webhook: [
    { id: 'webhook_received', label: 'Webhook Recebido', description: 'Evento customizado via webhook', category: 'Custom' },
  ],
};

// Filtros disponíveis por integração
const INTEGRATION_FILTERS: Record<string, Array<{
  id: string;
  label: string;
  type: 'number' | 'text' | 'tags' | 'select' | 'boolean';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}>> = {
  shopify: [
    { id: 'min_value', label: 'Valor Mínimo (R$)', type: 'number', placeholder: '0' },
    { id: 'max_value', label: 'Valor Máximo (R$)', type: 'number', placeholder: 'Sem limite' },
    { id: 'customer_tags', label: 'Tags do Cliente', type: 'tags', placeholder: 'vip, premium' },
    { id: 'exclude_tags', label: 'Excluir Tags', type: 'tags', placeholder: 'teste, spam' },
  ],
  whatsapp: [
    { id: 'keywords', label: 'Palavras-chave', type: 'tags', placeholder: 'preço, orçamento' },
    { id: 'business_hours_only', label: 'Apenas horário comercial', type: 'boolean' },
  ],
  hotmart: [
    { id: 'min_value', label: 'Valor Mínimo (R$)', type: 'number', placeholder: '0' },
    { id: 'product_ids', label: 'IDs dos Produtos', type: 'tags', placeholder: 'Deixe vazio para todos' },
  ],
  woocommerce: [
    { id: 'min_value', label: 'Valor Mínimo (R$)', type: 'number', placeholder: '0' },
    { id: 'max_value', label: 'Valor Máximo (R$)', type: 'number', placeholder: 'Sem limite' },
  ],
  webhook: [],
};

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }
  
  try {
    const connectedIntegrations: Array<{
      id: string;
      type: string;
      name: string;
      icon: string;
      color: string;
      isConnected: boolean;
      details: Record<string, any>;
      events: typeof INTEGRATION_EVENTS[string];
      filters: typeof INTEGRATION_FILTERS[string];
    }> = [];
    
    // =========================================
    // 1. Verificar Shopify
    // =========================================
    const { data: shopifyStores } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_name, is_active, access_token')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (shopifyStores && shopifyStores.length > 0) {
      // Verificar se tem access_token válido
      const validStores = shopifyStores.filter(s => s.access_token);
      
      if (validStores.length > 0) {
        connectedIntegrations.push({
          id: 'shopify',
          type: 'shopify',
          name: 'Shopify',
          icon: 'ShoppingCart',
          color: 'green',
          isConnected: true,
          details: {
            stores: validStores.map(s => ({
              id: s.id,
              domain: s.shop_domain,
              name: s.shop_name || s.shop_domain,
            })),
            storeCount: validStores.length,
          },
          events: INTEGRATION_EVENTS.shopify,
          filters: INTEGRATION_FILTERS.shopify,
        });
      }
    }
    
    // =========================================
    // 2. Verificar WhatsApp
    // =========================================
    const { data: whatsappAccounts } = await supabase
      .from('whatsapp_accounts')
      .select('id, phone_number, phone_number_id, display_name, is_active, access_token')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (whatsappAccounts && whatsappAccounts.length > 0) {
      // Verificar se tem credenciais válidas
      const validAccounts = whatsappAccounts.filter(a => a.access_token && a.phone_number_id);
      
      if (validAccounts.length > 0) {
        connectedIntegrations.push({
          id: 'whatsapp',
          type: 'whatsapp',
          name: 'WhatsApp',
          icon: 'MessageCircle',
          color: 'emerald',
          isConnected: true,
          details: {
            accounts: validAccounts.map(a => ({
              id: a.id,
              phoneNumber: a.phone_number,
              displayName: a.display_name || a.phone_number,
            })),
            accountCount: validAccounts.length,
          },
          events: INTEGRATION_EVENTS.whatsapp,
          filters: INTEGRATION_FILTERS.whatsapp,
        });
      }
    }
    
    // =========================================
    // 3. Verificar Hotmart (se existir tabela)
    // =========================================
    try {
      const { data: hotmartAccounts } = await supabase
        .from('hotmart_accounts')
        .select('id, account_name, is_active, client_id, client_secret')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      
      if (hotmartAccounts && hotmartAccounts.length > 0) {
        const validAccounts = hotmartAccounts.filter(a => a.client_id && a.client_secret);
        
        if (validAccounts.length > 0) {
          connectedIntegrations.push({
            id: 'hotmart',
            type: 'hotmart',
            name: 'Hotmart',
            icon: 'Flame',
            color: 'orange',
            isConnected: true,
            details: {
              accounts: validAccounts.map(a => ({
                id: a.id,
                name: a.account_name,
              })),
              accountCount: validAccounts.length,
            },
            events: INTEGRATION_EVENTS.hotmart,
            filters: INTEGRATION_FILTERS.hotmart,
          });
        }
      }
    } catch (e) {
      // Tabela não existe, ignorar
    }
    
    // =========================================
    // 4. Verificar WooCommerce (se existir tabela)
    // =========================================
    try {
      const { data: wooStores } = await supabase
        .from('woocommerce_stores')
        .select('id, store_url, store_name, is_active, consumer_key, consumer_secret')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      
      if (wooStores && wooStores.length > 0) {
        const validStores = wooStores.filter(s => s.consumer_key && s.consumer_secret);
        
        if (validStores.length > 0) {
          connectedIntegrations.push({
            id: 'woocommerce',
            type: 'woocommerce',
            name: 'WooCommerce',
            icon: 'ShoppingBag',
            color: 'purple',
            isConnected: true,
            details: {
              stores: validStores.map(s => ({
                id: s.id,
                url: s.store_url,
                name: s.store_name || s.store_url,
              })),
              storeCount: validStores.length,
            },
            events: INTEGRATION_EVENTS.woocommerce,
            filters: INTEGRATION_FILTERS.woocommerce,
          });
        }
      }
    } catch (e) {
      // Tabela não existe, ignorar
    }
    
    // =========================================
    // 5. Webhook sempre disponível
    // =========================================
    connectedIntegrations.push({
      id: 'webhook',
      type: 'webhook',
      name: 'Webhook',
      icon: 'Link',
      color: 'blue',
      isConnected: true,
      details: {
        description: 'Receba eventos de qualquer sistema externo',
      },
      events: INTEGRATION_EVENTS.webhook,
      filters: INTEGRATION_FILTERS.webhook,
    });
    
    // =========================================
    // Integrações não configuradas (para mostrar na UI)
    // =========================================
    const allIntegrationTypes = ['shopify', 'whatsapp', 'hotmart', 'woocommerce'];
    const connectedTypes = connectedIntegrations.map(i => i.type);
    const notConfigured = allIntegrationTypes
      .filter(type => !connectedTypes.includes(type))
      .map(type => {
        const labels: Record<string, { name: string; icon: string; color: string }> = {
          shopify: { name: 'Shopify', icon: 'ShoppingCart', color: 'green' },
          whatsapp: { name: 'WhatsApp', icon: 'MessageCircle', color: 'emerald' },
          hotmart: { name: 'Hotmart', icon: 'Flame', color: 'orange' },
          woocommerce: { name: 'WooCommerce', icon: 'ShoppingBag', color: 'purple' },
        };
        return {
          type,
          ...labels[type],
          isConnected: false,
        };
      });
    
    return NextResponse.json({
      connected: connectedIntegrations,
      notConfigured,
      totalConnected: connectedIntegrations.length,
    });
    
  } catch (error: any) {
    console.error('[Connected Integrations API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

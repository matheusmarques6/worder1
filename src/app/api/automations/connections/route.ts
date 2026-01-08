import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// ============================================
// GET - Listar conexões disponíveis
// ============================================

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams;
  const connectionType = searchParams.get('type');

  try {
    const connections: Array<{
      id: string;
      type: string;
      typeName: string;
      name: string;
      identifier?: string;
      icon: string;
      color: string;
      isActive: boolean;
      createdAt: string;
    }> = [];

    // ============================================
    // WHATSAPP - Evolution Instances
    // ============================================
    if (!connectionType || connectionType === 'whatsapp') {
      try {
        const { data: evolutionInstances } = await supabase
          .from('evolution_instances')
          .select('id, instance_name, phone_number, status, created_at')
          .order('created_at', { ascending: false });

        if (evolutionInstances) {
          for (const inst of evolutionInstances) {
            connections.push({
              id: inst.id,
              type: 'whatsapp_evolution',
              typeName: 'WhatsApp Evolution',
              name: inst.instance_name || 'WhatsApp',
              identifier: inst.phone_number || undefined,
              icon: 'MessageCircle',
              color: '#25D366',
              isActive: inst.status === 'connected',
              createdAt: inst.created_at,
            });
          }
        }
      } catch (e) {
        console.log('[Connections] evolution_instances not found');
      }

      // WhatsApp Cloud API
      try {
        const { data: whatsappConfigs } = await supabase
          .from('whatsapp_configs')
          .select('id, business_name, phone_number, is_active, created_at')
          .eq('is_active', true);

        if (whatsappConfigs) {
          for (const cfg of whatsappConfigs) {
            connections.push({
              id: cfg.id,
              type: 'whatsapp_cloud',
              typeName: 'WhatsApp Cloud',
              name: cfg.business_name || 'WhatsApp Business',
              identifier: cfg.phone_number || undefined,
              icon: 'MessageCircle',
              color: '#25D366',
              isActive: cfg.is_active,
              createdAt: cfg.created_at,
            });
          }
        }
      } catch (e) {
        console.log('[Connections] whatsapp_configs not found');
      }
    }

    // ============================================
    // EMAIL
    // ============================================
    if (!connectionType || connectionType === 'email') {
      // Resend / SendGrid configs
      try {
        const { data: emailConfigs } = await supabase
          .from('email_configs')
          .select('id, name, from_email, provider, is_active, created_at')
          .eq('is_active', true);

        if (emailConfigs) {
          for (const cfg of emailConfigs) {
            connections.push({
              id: cfg.id,
              type: `email_${cfg.provider}`,
              typeName: cfg.provider === 'resend' ? 'Email (Resend)' : cfg.provider === 'sendgrid' ? 'Email (SendGrid)' : 'Email (SMTP)',
              name: cfg.name || `Email ${cfg.provider}`,
              identifier: cfg.from_email || undefined,
              icon: 'Mail',
              color: cfg.provider === 'resend' ? '#000000' : '#1A82E2',
              isActive: cfg.is_active,
              createdAt: cfg.created_at,
            });
          }
        }
      } catch (e) {
        console.log('[Connections] email_configs not found');
      }
    }

    // ============================================
    // SHOPIFY
    // ============================================
    if (!connectionType || connectionType === 'shopify') {
      try {
        const { data: shopifyStores } = await supabase
          .from('shopify_stores')
          .select('id, shop_name, shop_domain, is_active, created_at')
          .eq('is_active', true);

        if (shopifyStores) {
          for (const store of shopifyStores) {
            connections.push({
              id: store.id,
              type: 'shopify',
              typeName: 'Shopify',
              name: store.shop_name || store.shop_domain,
              identifier: store.shop_domain,
              icon: 'ShoppingCart',
              color: '#7AB55C',
              isActive: store.is_active,
              createdAt: store.created_at,
            });
          }
        }
      } catch (e) {
        console.log('[Connections] shopify_stores not found');
      }
    }

    // ============================================
    // WOOCOMMERCE
    // ============================================
    if (!connectionType || connectionType === 'woocommerce') {
      try {
        const { data: wooStores } = await supabase
          .from('woocommerce_stores')
          .select('id, store_name, store_url, is_active, created_at')
          .eq('is_active', true);

        if (wooStores) {
          for (const store of wooStores) {
            connections.push({
              id: store.id,
              type: 'woocommerce',
              typeName: 'WooCommerce',
              name: store.store_name || store.store_url,
              identifier: store.store_url,
              icon: 'ShoppingBag',
              color: '#96588A',
              isActive: store.is_active,
              createdAt: store.created_at,
            });
          }
        }
      } catch (e) {
        console.log('[Connections] woocommerce_stores not found');
      }
    }

    // ============================================
    // KLAVIYO
    // ============================================
    if (!connectionType || connectionType === 'klaviyo') {
      try {
        const { data: klaviyoAccounts } = await supabase
          .from('klaviyo_accounts')
          .select('id, account_name, is_active, created_at')
          .eq('is_active', true);

        if (klaviyoAccounts) {
          for (const acc of klaviyoAccounts) {
            connections.push({
              id: acc.id,
              type: 'klaviyo',
              typeName: 'Klaviyo',
              name: acc.account_name || 'Klaviyo',
              icon: 'Mail',
              color: '#2A2A2A',
              isActive: acc.is_active,
              createdAt: acc.created_at,
            });
          }
        }
      } catch (e) {
        console.log('[Connections] klaviyo_accounts not found');
      }
    }

    // ============================================
    // HTTP / CREDENTIALS
    // ============================================
    if (!connectionType || connectionType === 'http') {
      try {
        const { data: credentials } = await supabase
          .from('credentials')
          .select('id, name, type, created_at')
          .in('type', ['httpBasicAuth', 'httpBearerToken', 'httpApiKey']);

        if (credentials) {
          for (const cred of credentials) {
            connections.push({
              id: cred.id,
              type: 'http',
              typeName: cred.type === 'httpBearerToken' ? 'HTTP Bearer' : cred.type === 'httpBasicAuth' ? 'HTTP Basic' : 'HTTP API Key',
              name: cred.name,
              icon: 'Key',
              color: '#3B82F6',
              isActive: true,
              createdAt: cred.created_at,
            });
          }
        }
      } catch (e) {
        console.log('[Connections] credentials not found');
      }
    }

    // Ordenar por nome
    connections.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ connections });

  } catch (error: any) {
    console.error('[Connections API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

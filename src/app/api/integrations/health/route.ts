// =============================================
// API: Integration Health Check
// src/app/api/integrations/health/route.ts
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { IntegrationHealthService, IntegrationType } from '@/lib/services/integration-health';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface ShopifyStoreRow {
  id: string;
  organization_id: string;
  shop_name: string | null;
  shop_domain: string;
  status: string | null;
  connection_status: string | null;
  status_message: string | null;
  health_checked_at: string | null;
  consecutive_failures: number | null;
  last_sync_at: string | null;
  created_at: string;
}

interface WhatsAppConfigRow {
  id: string;
  organization_id: string;
  business_name: string | null;
  phone_number: string;
  is_active: boolean;
  connection_status: string | null;
  status_message: string | null;
  health_checked_at: string | null;
  consecutive_failures: number | null;
  created_at: string;
}

interface FormattedIntegration {
  integration_type: string;
  integration_id: string;
  organization_id: string;
  name: string | null;
  identifier: string;
  is_active: boolean;
  connection_status: string;
  status_message: string | null;
  health_checked_at: string | null;
  consecutive_failures: number;
  last_sync_at: string | null;
  health_status: string;
}

function getSupabaseClient() {
  return getSupabaseAdmin();
}

function getHealthStatus(connectionStatus: string | null, failures: number | null): string {
  const status = connectionStatus ?? 'active';
  const consecutiveFailures = failures ?? 0;
  
  if (status === 'active' && consecutiveFailures === 0) return 'healthy';
  if (status === 'warning' || (consecutiveFailures > 0 && consecutiveFailures < 3)) return 'degraded';
  return 'unhealthy';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseClient();
    
    // Tentar buscar via view primeiro
    const { data: integrations, error } = await supabase
      .from('v_integration_status')
      .select('*')
      .eq('organization_id', organizationId);
    
    if (!error && integrations) {
      return NextResponse.json({ integrations });
    }
    
    // Fallback: buscar direto das tabelas
    const formattedIntegrations: FormattedIntegration[] = [];
    
    // Buscar Shopify stores
    const { data: shopifyStores } = await supabase
      .from('shopify_stores')
      .select(`
        id,
        organization_id,
        shop_name,
        shop_domain,
        status,
        connection_status,
        status_message,
        health_checked_at,
        consecutive_failures,
        last_sync_at,
        created_at
      `)
      .eq('organization_id', organizationId)
      .or('status.eq.active,status.is.null');
    
    if (shopifyStores) {
      for (const s of shopifyStores as ShopifyStoreRow[]) {
        formattedIntegrations.push({
          integration_type: 'shopify',
          integration_id: s.id,
          organization_id: s.organization_id,
          name: s.shop_name,
          identifier: s.shop_domain,
          is_active: s.status === 'active' || !s.status,
          connection_status: s.connection_status ?? 'active',
          status_message: s.status_message,
          health_checked_at: s.health_checked_at,
          consecutive_failures: s.consecutive_failures ?? 0,
          last_sync_at: s.last_sync_at,
          health_status: getHealthStatus(s.connection_status, s.consecutive_failures),
        });
      }
    }
    
    // Buscar WhatsApp configs
    const { data: whatsappConfigs } = await supabase
      .from('whatsapp_configs')
      .select(`
        id,
        organization_id,
        business_name,
        phone_number,
        is_active,
        connection_status,
        status_message,
        health_checked_at,
        consecutive_failures,
        created_at
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (whatsappConfigs) {
      for (const w of whatsappConfigs as WhatsAppConfigRow[]) {
        formattedIntegrations.push({
          integration_type: 'whatsapp',
          integration_id: w.id,
          organization_id: w.organization_id,
          name: w.business_name ?? 'WhatsApp Business',
          identifier: w.phone_number,
          is_active: w.is_active,
          connection_status: w.connection_status ?? 'active',
          status_message: w.status_message,
          health_checked_at: w.health_checked_at,
          consecutive_failures: w.consecutive_failures ?? 0,
          last_sync_at: null,
          health_status: getHealthStatus(w.connection_status, w.consecutive_failures),
        });
      }
    }
    
    return NextResponse.json({ integrations: formattedIntegrations });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Health status error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, integrationId, organizationId, checkAll } = body as {
      type?: string;
      integrationId?: string;
      organizationId?: string;
      checkAll?: boolean;
    };
    
    const supabase = getSupabaseClient();
    const healthService = new IntegrationHealthService(supabase);
    
    if (checkAll && organizationId) {
      const results = await healthService.checkOrganizationIntegrations(organizationId);
      return NextResponse.json(results);
    }
    
    if (!type || !integrationId) {
      return NextResponse.json(
        { error: 'type and integrationId required' },
        { status: 400 }
      );
    }
    
    // Validar tipo
    if (type !== 'shopify' && type !== 'whatsapp') {
      return NextResponse.json(
        { error: 'Invalid integration type. Supported: shopify, whatsapp' },
        { status: 400 }
      );
    }
    
    const result = await healthService.checkIntegration(type as IntegrationType, integrationId);
    
    return NextResponse.json({
      success: result.success,
      status: result.status,
      statusCode: result.statusCode,
      message: result.message,
      responseTimeMs: result.responseTimeMs,
      shouldNotify: result.shouldNotify,
    });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Health check error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

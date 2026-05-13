import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// GET - Lista TODAS as lojas do usuário (de todas as orgs que ele é membro)
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const userId = auth.user.id;
  const userDefaultOrgId = auth.user.organization_id;

  try {
    // 1. Buscar todas as organizações que o usuário é membro
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userId);

    let orgIds: string[] = [];
    
    if (memberships && memberships.length > 0) {
      orgIds = memberships.map(m => m.organization_id);
    }
    
    // Sempre incluir a org do profile do usuário
    if (userDefaultOrgId && !orgIds.includes(userDefaultOrgId)) {
      orgIds.push(userDefaultOrgId);
    }

    if (orgIds.length === 0) {
      return NextResponse.json({ stores: [], organizations: [] });
    }

    // 2. Buscar todas as lojas dessas organizações
    const { data: stores, error: storesError } = await supabaseAdmin
      .from('shopify_stores')
      .select(`
        id,
        organization_id,
        shop_name,
        shop_domain,
        shop_email,
        currency,
        is_active,
        total_orders,
        total_revenue,
        last_sync_at,
        connection_status,
        status_message,
        health_checked_at,
        consecutive_failures,
        embed_installed,
        embed_installed_at,
        webhooks_registered,
        created_at
      `)
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false });

    if (storesError) {
      console.error('Error fetching stores:', storesError);
      throw storesError;
    }

    // 3. Buscar nomes das organizações
    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);

    const orgMap = new Map(orgs?.map(o => [o.id, o.name]) || []);

    // 4. Formatar resposta
    const formattedStores = stores?.map((s: any) => ({
      id: s.id,
      organization_id: s.organization_id,
      organization_name: orgMap.get(s.organization_id) || 'Organização',
      name: s.shop_name,
      domain: s.shop_domain,
      email: s.shop_email,
      currency: s.currency,
      isActive: s.is_active,
      totalOrders: s.total_orders,
      totalRevenue: s.total_revenue,
      lastSyncAt: s.last_sync_at,
      connectionStatus: s.connection_status || 'active',
      statusMessage: s.status_message,
      healthCheckedAt: s.health_checked_at,
      consecutiveFailures: s.consecutive_failures || 0,
      embedInstalled: s.embed_installed === true,
      embedInstalledAt: s.embed_installed_at,
      webhooksRegistered: s.webhooks_registered === true,
    })) || [];

    return NextResponse.json({
      stores: formattedStores,
      organizations: orgs?.map(o => ({ id: o.id, name: o.name })) || [],
      defaultOrganizationId: userDefaultOrgId,
    });

  } catch (error: any) {
    console.error('List all stores error:', error);
    return NextResponse.json({ error: error.message || 'Erro ao buscar lojas' }, { status: 500 });
  }
}

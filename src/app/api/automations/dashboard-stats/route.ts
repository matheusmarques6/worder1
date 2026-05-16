// =============================================
// API: Dashboard Stats para Automações (Flow Builder)
// /src/app/api/automations/dashboard-stats/route.ts
//
// Endpoint NOVO para os cards do dashboard de automações
// Não altera o /api/automations/stats existente (usado pelo CRM)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    // Buscar organization_id do usuário
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!member?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const orgId = member.organization_id;
    // Multi-org membership unions (rare but supported). Caller can
    // pass ?storeId=... to scope every aggregate to a single store.
    // Without scoping the dashboard cards would mix all stores in
    // the org — that's the "Automações Ativas mostra org-wide quando
    // estou no Dr. Melaxin" bug.
    const storeId = request.nextUrl.searchParams.get('storeId') || request.nextUrl.searchParams.get('store_id');
    // For deals queries we need user's store_ids since `deals` only
    // has store_id, no organization_id column.
    let userStoreIds: string[] = [];
    if (storeId) {
      const { data: ownedStore } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('id', storeId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (ownedStore) userStoreIds = [ownedStore.id];
    } else {
      const { data: orgStores } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('organization_id', orgId);
      userStoreIds = (orgStores || []).map((s: any) => s.id);
    }

    // =============================================
    // 1. Automações Ativas (filtra por store se fornecido)
    // =============================================
    let activeQuery = supabase
      .from('automations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active');
    if (storeId) activeQuery = activeQuery.eq('store_id', storeId);
    const { count: activeAutomations } = await activeQuery;

    // =============================================
    // 2. Processados Hoje
    // =============================================
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let processedToday = 0;

    let runsTodayQuery = supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', todayStart.toISOString());
    if (storeId) runsTodayQuery = runsTodayQuery.eq('store_id', storeId);
    const { count: runsToday } = await runsTodayQuery;

    processedToday = runsToday || 0;

    if (processedToday === 0) {
      try {
        let execsQuery = supabase
          .from('automation_executions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('started_at', todayStart.toISOString());
        if (storeId) execsQuery = execsQuery.eq('store_id', storeId);
        const { count: execsToday } = await execsQuery;
        processedToday = execsToday || 0;
      } catch (e) {
        // Tabela pode não existir
      }
    }

    // =============================================
    // 3. Conversões (últimos 30 dias) — runs com deal_id, escopadas
    // =============================================
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let conversions30d = 0;

    let dealsRunsQuery = supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .not('deal_id', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString());
    if (storeId) dealsRunsQuery = dealsRunsQuery.eq('store_id', storeId);
    const { count: dealsFromRuns } = await dealsRunsQuery;

    conversions30d = dealsFromRuns || 0;

    // Fallback via automation_rules.deals_created_count
    let rulesQuery = supabase
      .from('automation_rules')
      .select('deals_created_count')
      .eq('organization_id', orgId);
    if (storeId) rulesQuery = rulesQuery.eq('store_id', storeId);
    const { data: rules } = await rulesQuery;

    if (rules) {
      const rulesCreated = rules.reduce((sum: number, r: any) => sum + (r.deals_created_count || 0), 0);
      if (conversions30d === 0) {
        conversions30d = rulesCreated;
      }
    }

    // =============================================
    // 4. Receita 30d — soma do valor dos deals via automação
    // =============================================
    let revenue30d = 0;

    let runsWithDealsQuery = supabase
      .from('automation_runs')
      .select('deal_id')
      .eq('organization_id', orgId)
      .not('deal_id', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString());
    if (storeId) runsWithDealsQuery = runsWithDealsQuery.eq('store_id', storeId);
    const { data: runsWithDeals } = await runsWithDealsQuery;

    if (runsWithDeals && runsWithDeals.length > 0) {
      const dealIds = runsWithDeals.map((r: any) => r.deal_id).filter(Boolean);

      if (dealIds.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < dealIds.length; i += chunkSize) {
          const chunk = dealIds.slice(i, i + chunkSize);
          // deals só tem store_id — escope por user stores pra evitar
          // que id leakado de outra org seja somado
          const dealsQuery = userStoreIds.length > 0
            ? supabase.from('deals').select('value').in('id', chunk).in('store_id', userStoreIds)
            : supabase.from('deals').select('value').in('id', chunk);
          const { data: deals } = await dealsQuery;

          if (deals) {
            revenue30d += deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
          }
        }
      }
    }

    // Fallback: total de deals criados no período se não tiver
    // attribuição (escopado por user stores — deals não tem
    // organization_id, único filtro de tenant é via store_id).
    if (revenue30d === 0 && userStoreIds.length > 0) {
      const { data: recentDeals } = await supabase
        .from('deals')
        .select('value')
        .in('store_id', userStoreIds)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .limit(1000);

      if (recentDeals) {
        revenue30d = recentDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
      }
    }

    // =============================================
    // Retornar stats
    // =============================================
    return NextResponse.json({
      activeAutomations: activeAutomations || 0,
      processedToday: processedToday || 0,
      conversions30d: conversions30d || 0,
      revenue30d: revenue30d || 0,
    });

  } catch (error: any) {
    console.error('[DashboardStats] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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

    // `automation_runs` não tem store_id: quem carrega a loja é a
    // automação. Para escopar as execuções por loja, resolvemos antes
    // os ids das automações daquela loja e filtramos por eles — antes
    // o `.eq('store_id', …)` derrubava a consulta e todos os cards de
    // execução mostravam zero em qualquer loja selecionada.
    let storeAutomationIds: string[] | null = null;
    if (storeId) {
      const { data: storeAutomations } = await supabase
        .from('automations')
        .select('id')
        .eq('organization_id', orgId)
        .eq('store_id', storeId);
      storeAutomationIds = (storeAutomations || []).map((a: any) => a.id);
    }
    const semAutomacoesDaLoja = storeAutomationIds !== null && storeAutomationIds.length === 0;

    // =============================================
    // 2. Processados Hoje
    // =============================================
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let processedToday = 0;

    if (!semAutomacoesDaLoja) {
      let runsTodayQuery = supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', todayStart.toISOString());
      if (storeAutomationIds) runsTodayQuery = runsTodayQuery.in('automation_id', storeAutomationIds);
      const { count: runsToday } = await runsTodayQuery;

      processedToday = runsToday || 0;
    }

    // =============================================
    // 3. Conversões (últimos 30 dias) — runs com deal_id, escopadas
    // =============================================
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let conversions30d = 0;

    if (!semAutomacoesDaLoja) {
      let dealsRunsQuery = supabase
        .from('automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('deal_id', 'is', null)
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (storeAutomationIds) dealsRunsQuery = dealsRunsQuery.in('automation_id', storeAutomationIds);
      const { count: dealsFromRuns } = await dealsRunsQuery;

      conversions30d = dealsFromRuns || 0;
    }

    // =============================================
    // 4. Receita 30d — soma do valor dos deals via automação
    // =============================================
    let revenue30d = 0;

    let runsWithDeals: any[] = [];
    if (!semAutomacoesDaLoja) {
      let runsWithDealsQuery = supabase
        .from('automation_runs')
        .select('deal_id')
        .eq('organization_id', orgId)
        .not('deal_id', 'is', null)
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (storeAutomationIds) runsWithDealsQuery = runsWithDealsQuery.in('automation_id', storeAutomationIds);
      const { data } = await runsWithDealsQuery;
      runsWithDeals = data || [];
    }

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

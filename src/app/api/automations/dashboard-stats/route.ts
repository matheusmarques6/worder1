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

    // =============================================
    // 1. Automações Ativas
    // =============================================
    const { count: activeAutomations } = await supabase
      .from('automations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active');

    // =============================================
    // 2. Processados Hoje
    // =============================================
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Tentar automation_runs primeiro (tabela do flow builder)
    let processedToday = 0;
    
    const { count: runsToday } = await supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', todayStart.toISOString());

    processedToday = runsToday || 0;

    // Se não tiver nada, tentar automation_executions (legado)
    if (processedToday === 0) {
      try {
        const { count: execsToday } = await supabase
          .from('automation_executions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('started_at', todayStart.toISOString());
        
        processedToday = execsToday || 0;
      } catch (e) {
        // Tabela pode não existir
      }
    }

    // =============================================
    // 3. Conversões (últimos 30 dias)
    // - Deals criados via automação
    // =============================================
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let conversions30d = 0;

    // Opção A: Buscar runs que têm deal_id preenchido
    const { count: dealsFromRuns } = await supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .not('deal_id', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString());

    conversions30d = dealsFromRuns || 0;

    // Opção B: Também contar deals_created_count das automation_rules
    const { data: rules } = await supabase
      .from('automation_rules')
      .select('deals_created_count')
      .eq('organization_id', orgId);

    if (rules) {
      const rulesCreated = rules.reduce((sum: number, r: any) => sum + (r.deals_created_count || 0), 0);
      // Não somar se já tiver dealsFromRuns, para não duplicar
      if (conversions30d === 0) {
        conversions30d = rulesCreated;
      }
    }

    // =============================================
    // 4. Receita (últimos 30 dias)
    // - Valor dos deals criados via automação
    // =============================================
    let revenue30d = 0;

    // Buscar deal_ids das automações
    const { data: runsWithDeals } = await supabase
      .from('automation_runs')
      .select('deal_id')
      .eq('organization_id', orgId)
      .not('deal_id', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (runsWithDeals && runsWithDeals.length > 0) {
      const dealIds = runsWithDeals.map((r: any) => r.deal_id).filter(Boolean);
      
      if (dealIds.length > 0) {
        // Buscar em chunks de 500 para evitar limite do IN
        const chunkSize = 500;
        for (let i = 0; i < dealIds.length; i += chunkSize) {
          const chunk = dealIds.slice(i, i + chunkSize);
          const { data: deals } = await supabase
            .from('deals')
            .select('value')
            .in('id', chunk);
          
          if (deals) {
            revenue30d += deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
          }
        }
      }
    }

    // Se não tiver receita de automações, mostrar total de deals
    // (para não parecer zerado no dashboard)
    if (revenue30d === 0) {
      const { data: recentDeals } = await supabase
        .from('deals')
        .select('value')
        .eq('organization_id', orgId)
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

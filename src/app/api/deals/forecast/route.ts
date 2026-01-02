// =============================================
// Sales Forecast API
// src/app/api/deals/forecast/route.ts
//
// GET: Buscar métricas de forecast
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return getSupabaseAdmin();
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const pipelineId = searchParams.get('pipelineId');
  const period = searchParams.get('period') || 'month'; // month, quarter, year
  
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }
  
  try {
    // Calcular datas do período
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;
    let previousStartDate: Date;
    let previousEndDate: Date;
    
    switch (period) {
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        previousStartDate = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
        previousEndDate = new Date(now.getFullYear(), currentQuarter * 3, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
        previousEndDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
    }
    
    // ========================================
    // 1. BUSCAR DEALS ABERTOS
    // ========================================
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id,
        title,
        value,
        status,
        commit_level,
        expected_close_date,
        created_at,
        stage_id,
        pipeline_id,
        contact:contacts(id, first_name, last_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'open');
    
    if (pipelineId) {
      dealsQuery = dealsQuery.eq('pipeline_id', pipelineId);
    }
    
    const { data: openDeals, error: dealsError } = await dealsQuery;
    
    if (dealsError) {
      console.error('[Forecast API] Error fetching deals:', dealsError);
      return NextResponse.json({ error: dealsError.message }, { status: 500 });
    }
    
    // ========================================
    // 2. BUSCAR STAGES COM PROBABILIDADE
    // ========================================
    const stageIds = [...new Set(openDeals?.map(d => d.stage_id).filter(Boolean))];
    let stagesMap: Record<string, any> = {};
    
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, name, color, probability, position')
        .in('id', stageIds);
      
      stages?.forEach(s => {
        stagesMap[s.id] = s;
      });
    }
    
    // ========================================
    // 3. CALCULAR MÉTRICAS
    // ========================================
    const deals = openDeals || [];
    
    // Total pipeline
    const totalPipeline = deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    
    // Weighted pipeline (valor × probabilidade)
    const weightedPipeline = deals.reduce((sum, d) => {
      const probability = stagesMap[d.stage_id]?.probability || 50;
      return sum + ((Number(d.value) || 0) * probability / 100);
    }, 0);
    
    // Por commit level
    const byCommitLevel = {
      omit: deals.filter(d => d.commit_level === 'omit').reduce((s, d) => s + (Number(d.value) || 0), 0),
      pipeline: deals.filter(d => d.commit_level === 'pipeline' || !d.commit_level).reduce((s, d) => s + (Number(d.value) || 0), 0),
      best_case: deals.filter(d => d.commit_level === 'best_case').reduce((s, d) => s + (Number(d.value) || 0), 0),
      commit: deals.filter(d => d.commit_level === 'commit').reduce((s, d) => s + (Number(d.value) || 0), 0),
    };
    
    // Por stage
    const byStage = deals.reduce((acc: any, deal) => {
      const stage = stagesMap[deal.stage_id];
      const stageName = stage?.name || 'Sem Estágio';
      const stageId = deal.stage_id || 'none';
      
      if (!acc[stageId]) {
        acc[stageId] = {
          id: stageId,
          name: stageName,
          color: stage?.color || '#666',
          probability: stage?.probability || 50,
          position: stage?.position || 0,
          count: 0,
          value: 0,
          weightedValue: 0,
        };
      }
      
      acc[stageId].count++;
      acc[stageId].value += Number(deal.value) || 0;
      acc[stageId].weightedValue += (Number(deal.value) || 0) * (stage?.probability || 50) / 100;
      
      return acc;
    }, {});
    
    // Ordenar por position
    const stagesArray = Object.values(byStage).sort((a: any, b: any) => a.position - b.position);
    
    // ========================================
    // 4. BUSCAR DEALS FECHADOS (para win rate)
    // ========================================
    const { data: closedDeals } = await supabase
      .from('deals')
      .select('id, status, value, closed_at')
      .eq('organization_id', organizationId)
      .in('status', ['won', 'lost'])
      .gte('closed_at', startDate.toISOString())
      .lte('closed_at', endDate.toISOString());
    
    const wonDeals = closedDeals?.filter(d => d.status === 'won') || [];
    const lostDeals = closedDeals?.filter(d => d.status === 'lost') || [];
    
    const totalClosed = wonDeals.length + lostDeals.length;
    const winRate = totalClosed > 0 ? (wonDeals.length / totalClosed) * 100 : 0;
    const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    
    // ========================================
    // 5. BUSCAR PERÍODO ANTERIOR
    // ========================================
    const { data: previousClosedDeals } = await supabase
      .from('deals')
      .select('id, status, value')
      .eq('organization_id', organizationId)
      .in('status', ['won', 'lost'])
      .gte('closed_at', previousStartDate.toISOString())
      .lte('closed_at', previousEndDate.toISOString());
    
    const previousWonDeals = previousClosedDeals?.filter(d => d.status === 'won') || [];
    const previousWonValue = previousWonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    
    // ========================================
    // 6. CALCULAR VELOCIDADE DE VENDAS
    // ========================================
    const { data: stageHistory } = await supabase
      .from('deal_stage_history')
      .select('to_stage_id, to_stage_name, time_in_previous_stage')
      .eq('organization_id', organizationId)
      .gte('changed_at', startDate.toISOString());
    
    const velocityByStage = stageHistory?.reduce((acc: any, h) => {
      if (!h.to_stage_id) return acc;
      
      if (!acc[h.to_stage_id]) {
        acc[h.to_stage_id] = {
          name: h.to_stage_name,
          count: 0,
          totalTime: 0,
        };
      }
      
      acc[h.to_stage_id].count++;
      
      // Converter interval para horas
      if (h.time_in_previous_stage) {
        const match = h.time_in_previous_stage.match(/(\d+):(\d+):(\d+)/);
        if (match) {
          acc[h.to_stage_id].totalTime += parseInt(match[1]) + parseInt(match[2]) / 60;
        }
      }
      
      return acc;
    }, {}) || {};
    
    // Calcular média por stage
    const velocity = Object.entries(velocityByStage).map(([id, data]: [string, any]) => ({
      stageId: id,
      stageName: data.name,
      avgTimeHours: data.count > 0 ? Math.round((data.totalTime / data.count) * 10) / 10 : 0,
      dealsCount: data.count,
    }));
    
    // ========================================
    // 7. MONTAR RESPOSTA
    // ========================================
    return NextResponse.json({
      period,
      periodLabel: period === 'month' ? 'Este Mês' : period === 'quarter' ? 'Este Trimestre' : 'Este Ano',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      
      // Métricas principais
      metrics: {
        pipeline_total: Math.round(totalPipeline * 100) / 100,
        weighted_total: Math.round(weightedPipeline * 100) / 100,
        deal_count: deals.length,
        avg_deal_value: deals.length > 0 ? Math.round((totalPipeline / deals.length) * 100) / 100 : 0,
        // Aliases camelCase para compatibilidade
        totalPipeline: Math.round(totalPipeline * 100) / 100,
        weightedPipeline: Math.round(weightedPipeline * 100) / 100,
        dealCount: deals.length,
        avgDealValue: deals.length > 0 ? Math.round((totalPipeline / deals.length) * 100) / 100 : 0,
      },
      
      // Por commit level
      byCommitLevel: {
        omit: Math.round(byCommitLevel.omit * 100) / 100,
        pipeline: Math.round(byCommitLevel.pipeline * 100) / 100,
        bestCase: Math.round(byCommitLevel.best_case * 100) / 100,
        commit: Math.round(byCommitLevel.commit * 100) / 100,
      },
      
      // Por stage (para funil)
      byStage: stagesArray,
      
      // Performance do período
      performance: {
        won: {
          count: wonDeals.length,
          value: Math.round(wonValue * 100) / 100,
        },
        lost: {
          count: lostDeals.length,
          value: Math.round(lostDeals.reduce((s, d) => s + (Number(d.value) || 0), 0) * 100) / 100,
        },
        winRate: Math.round(winRate * 10) / 10,
      },
      
      // Comparação com período anterior
      vsPrevious: {
        previousWonValue: Math.round(previousWonValue * 100) / 100,
        changePercent: previousWonValue > 0 
          ? Math.round(((wonValue - previousWonValue) / previousWonValue) * 1000) / 10
          : wonValue > 0 ? 100 : 0,
      },
      
      // Velocidade de vendas
      velocity,
      
      // Top deals
      topDeals: deals
        .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
        .slice(0, 5)
        .map(d => {
          // Supabase retorna relações como array
          const contact = Array.isArray(d.contact) ? d.contact[0] : d.contact;
          return {
            id: d.id,
            title: d.title,
            value: d.value,
            stage: stagesMap[d.stage_id]?.name || 'Sem Estágio',
            probability: stagesMap[d.stage_id]?.probability || 50,
            expectedCloseDate: d.expected_close_date,
            contact: contact ? {
              name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
              email: contact.email,
            } : null,
          };
        }),
    });
    
  } catch (error: any) {
    console.error('[Forecast API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

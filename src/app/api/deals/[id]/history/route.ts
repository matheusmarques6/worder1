// =============================================
// Deal Stage History API
// src/app/api/deals/[id]/history/route.ts
//
// GET: Buscar histórico de mudanças de stage
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const dealId = params.id;
  
  if (!dealId) {
    return NextResponse.json({ error: 'Deal ID required' }, { status: 400 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '50');
  
  try {
    // Buscar histórico de mudanças - RLS filtra automaticamente
    const { data: history, error } = await supabase
      .from('deal_stage_history')
      .select(`
        id,
        from_stage_id,
        to_stage_id,
        from_stage_name,
        to_stage_name,
        changed_by,
        changed_at,
        time_in_previous_stage,
        notes
      `)
      .eq('deal_id', dealId)
      .order('changed_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[Deal History API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Buscar info dos usuários
    const userIds = [...new Set(history?.filter(h => h.changed_by).map(h => h.changed_by))];
    let usersMap: Record<string, any> = {};
    
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);
      
      users?.forEach(u => {
        usersMap[u.id] = u;
      });
    }
    
    // Formatar resposta
    const formattedHistory = history?.map(h => ({
      id: h.id,
      fromStage: h.from_stage_name ? {
        id: h.from_stage_id,
        name: h.from_stage_name,
      } : null,
      toStage: {
        id: h.to_stage_id,
        name: h.to_stage_name,
      },
      changedBy: h.changed_by ? usersMap[h.changed_by] : null,
      changedAt: h.changed_at,
      timeInPreviousStage: h.time_in_previous_stage,
      notes: h.notes,
    }));
    
    // Calcular métricas
    const totalTimeInPipeline = history?.reduce((acc, h) => {
      if (h.time_in_previous_stage) {
        const match = h.time_in_previous_stage.match(/(\d+):(\d+):(\d+)/);
        if (match) {
          const hours = parseInt(match[1]) + parseInt(match[2]) / 60;
          return acc + hours;
        }
      }
      return acc;
    }, 0) || 0;
    
    return NextResponse.json({
      history: formattedHistory || [],
      metrics: {
        totalChanges: history?.length || 0,
        totalTimeInPipelineHours: Math.round(totalTimeInPipeline * 100) / 100,
        averageTimePerStageHours: history?.length 
          ? Math.round((totalTimeInPipeline / history.length) * 100) / 100 
          : 0,
      },
    });
    
  } catch (error: any) {
    console.error('[Deal History API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

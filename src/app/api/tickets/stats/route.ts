// =============================================
// API: Ticket Stats
// src/app/api/tickets/stats/route.ts
// GET - Estatísticas de tickets
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const assignedTo = searchParams.get('assigned_to');

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // Buscar todos os tickets
    let query = supabaseAdmin
      .from('tickets')
      .select('status, priority, category, sla_breached, resolution_time_minutes, first_response_at, satisfaction_rating, created_at')
      .eq('organization_id', organizationId);

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }

    const { data: tickets, error } = await query;

    if (error) throw error;

    // Calcular estatísticas
    const stats = {
      total: tickets?.length || 0,
      open: tickets?.filter(t => t.status === 'open').length || 0,
      in_progress: tickets?.filter(t => t.status === 'in_progress').length || 0,
      waiting_customer: tickets?.filter(t => t.status === 'waiting_customer').length || 0,
      waiting_internal: tickets?.filter(t => t.status === 'waiting_internal').length || 0,
      resolved: tickets?.filter(t => t.status === 'resolved').length || 0,
      closed: tickets?.filter(t => t.status === 'closed').length || 0,
      sla_breached: tickets?.filter(t => t.sla_breached).length || 0,
    };

    // Por prioridade
    const byPriority = {
      urgent: tickets?.filter(t => t.priority === 'urgent' && !['resolved', 'closed'].includes(t.status)).length || 0,
      high: tickets?.filter(t => t.priority === 'high' && !['resolved', 'closed'].includes(t.status)).length || 0,
      normal: tickets?.filter(t => t.priority === 'normal' && !['resolved', 'closed'].includes(t.status)).length || 0,
      low: tickets?.filter(t => t.priority === 'low' && !['resolved', 'closed'].includes(t.status)).length || 0,
    };

    // Por categoria
    const categories = ['delivery', 'payment', 'product', 'refund', 'question', 'bug', 'feature', 'other'];
    const byCategory: Record<string, number> = {};
    categories.forEach(cat => {
      byCategory[cat] = tickets?.filter(t => t.category === cat && !['resolved', 'closed'].includes(t.status)).length || 0;
    });

    // Métricas de desempenho
    const resolvedTickets = tickets?.filter(t => ['resolved', 'closed'].includes(t.status) && t.resolution_time_minutes);
    const avgResolutionTime = resolvedTickets?.length 
      ? resolvedTickets.reduce((sum, t) => sum + (t.resolution_time_minutes || 0), 0) / resolvedTickets.length
      : 0;

    const respondedTickets = tickets?.filter(t => t.first_response_at);
    const avgFirstResponse = respondedTickets?.length
      ? respondedTickets.reduce((sum, t) => {
          const created = new Date(t.created_at).getTime();
          const responded = new Date(t.first_response_at!).getTime();
          return sum + (responded - created) / 60000; // minutos
        }, 0) / respondedTickets.length
      : 0;

    const ratedTickets = tickets?.filter(t => t.satisfaction_rating);
    const avgSatisfaction = ratedTickets?.length
      ? ratedTickets.reduce((sum, t) => sum + (t.satisfaction_rating || 0), 0) / ratedTickets.length
      : 0;

    return NextResponse.json({
      stats,
      byPriority,
      byCategory,
      performance: {
        avgResolutionTimeMinutes: Math.round(avgResolutionTime),
        avgFirstResponseMinutes: Math.round(avgFirstResponse),
        avgSatisfaction: Math.round(avgSatisfaction * 10) / 10,
        slaComplianceRate: stats.total > 0 
          ? Math.round(((stats.total - stats.sla_breached) / stats.total) * 100)
          : 100,
      },
    });
  } catch (error: any) {
    console.error('[Tickets Stats] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

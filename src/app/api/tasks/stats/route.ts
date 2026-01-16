// =============================================
// API: Task Stats
// src/app/api/tasks/stats/route.ts
// GET - Estatísticas de tarefas
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

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // Query base
    let query = supabaseAdmin
      .from('tasks')
      .select('id, status, due_date, priority, type')
      .eq('organization_id', organizationId);

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    // Calcular estatísticas
    const stats = {
      total: tasks?.length || 0,
      pending: tasks?.filter(t => t.status === 'pending').length || 0,
      in_progress: tasks?.filter(t => t.status === 'in_progress').length || 0,
      completed: tasks?.filter(t => t.status === 'completed').length || 0,
      cancelled: tasks?.filter(t => t.status === 'cancelled').length || 0,
      overdue: tasks?.filter(t => 
        t.due_date < today && ['pending', 'in_progress'].includes(t.status)
      ).length || 0,
      due_today: tasks?.filter(t => 
        t.due_date === today && ['pending', 'in_progress'].includes(t.status)
      ).length || 0,
      due_tomorrow: tasks?.filter(t => 
        t.due_date === tomorrow && ['pending', 'in_progress'].includes(t.status)
      ).length || 0,
      due_this_week: tasks?.filter(t => 
        t.due_date >= today && t.due_date <= weekEnd && ['pending', 'in_progress'].includes(t.status)
      ).length || 0,
    };

    // Por prioridade
    const byPriority = {
      urgent: tasks?.filter(t => t.priority === 'urgent' && t.status !== 'completed').length || 0,
      high: tasks?.filter(t => t.priority === 'high' && t.status !== 'completed').length || 0,
      normal: tasks?.filter(t => t.priority === 'normal' && t.status !== 'completed').length || 0,
      low: tasks?.filter(t => t.priority === 'low' && t.status !== 'completed').length || 0,
    };

    // Por tipo
    const byType = {
      call: tasks?.filter(t => t.type === 'call' && t.status !== 'completed').length || 0,
      email: tasks?.filter(t => t.type === 'email' && t.status !== 'completed').length || 0,
      whatsapp: tasks?.filter(t => t.type === 'whatsapp' && t.status !== 'completed').length || 0,
      meeting: tasks?.filter(t => t.type === 'meeting' && t.status !== 'completed').length || 0,
      task: tasks?.filter(t => t.type === 'task' && t.status !== 'completed').length || 0,
      followup: tasks?.filter(t => t.type === 'followup' && t.status !== 'completed').length || 0,
      payment: tasks?.filter(t => t.type === 'payment' && t.status !== 'completed').length || 0,
    };

    return NextResponse.json({
      stats,
      byPriority,
      byType,
    });
  } catch (error: any) {
    console.error('[Tasks Stats] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

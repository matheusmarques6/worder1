import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

// ============================================
// GET - Histórico de execuções de uma automação
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: automationId } = await params;
    const searchParams = request.nextUrl.searchParams;

    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 100);
    const includeSteps = searchParams.get('includeSteps') === 'true';

    // Verificar se automação existe - RLS filtra automaticamente
    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .select('id, name')
      .eq('id', automationId)
      .single();

    if (automationError || !automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    // Buscar execuções
    let query = supabase
      .from('automation_executions')
      .select(`
        id,
        status,
        trigger_type,
        trigger_data,
        contact_id,
        deal_id,
        started_at,
        completed_at,
        duration_ms,
        error_message,
        error_node_id,
        node_results,
        final_context
      `, { count: 'exact' })
      .eq('automation_id', automationId)
      .order('started_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    // Paginação
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: executions, error: queryError, count } = await query;

    if (queryError) {
      throw queryError;
    }

    // Buscar contatos relacionados
    const contactIds = [...new Set(executions?.map((e: any) => e.contact_id).filter(Boolean))];
    let contactsMap: Record<string, any> = {};

    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name')
        .in('id', contactIds);

      contactsMap = (contacts || []).reduce((acc: Record<string, any>, c: any) => {
        acc[c.id] = {
          id: c.id,
          email: c.email,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
        };
        return acc;
      }, {});
    }

    // Formatar resposta
    const formattedExecutions = executions?.map((exec: any) => {
      const nodeResults = exec.node_results || {};
      const totalSteps = Object.keys(nodeResults).length;
      const completedSteps = Object.values(nodeResults).filter((r: any) => r.status === 'success').length;
      const failedSteps = Object.values(nodeResults).filter((r: any) => r.status === 'error').length;

      return {
        id: exec.id,
        automation_id: automationId,
        automation_name: automation.name,
        status: exec.status,
        trigger_type: exec.trigger_type,
        trigger_data: exec.trigger_data,
        contact: exec.contact_id ? contactsMap[exec.contact_id] : null,
        deal_id: exec.deal_id,
        total_steps: totalSteps,
        completed_steps: completedSteps,
        failed_steps: failedSteps,
        duration_ms: exec.duration_ms,
        error_message: exec.error_message,
        error_node_id: exec.error_node_id,
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        ...(includeSteps && { node_results: nodeResults }),
      };
    }) || [];

    return NextResponse.json({
      automation: {
        id: automation.id,
        name: automation.name,
      },
      executions: formattedExecutions,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });

  } catch (error: any) {
    console.error('Erro ao buscar histórico:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// DELETE - Limpar histórico de execuções
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: automationId } = await params;
    const searchParams = request.nextUrl.searchParams;

    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30', 10);
    const status = searchParams.get('status'); // Opcional: deletar apenas de um status

    // Verificar se automação existe - RLS filtra automaticamente
    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .select('id')
      .eq('id', automationId)
      .single();

    if (automationError || !automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    // Calcular data de corte
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Deletar execuções
    let query = supabase
      .from('automation_executions')
      .delete()
      .eq('automation_id', automationId)
      .lt('started_at', cutoffDate.toISOString());

    if (status) {
      query = query.eq('status', status);
    }

    const { error: deleteError, count } = await query;

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      message: 'Histórico limpo',
      deleted_count: count || 0,
      older_than: cutoffDate.toISOString(),
    });

  } catch (error: any) {
    console.error('Erro ao limpar histórico:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

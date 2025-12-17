// =============================================
// WORDER: API de Execuções de Automações
// /src/app/api/automations/runs/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lazy client
let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// =============================================
// GET - Listar execuções
// =============================================
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const searchParams = request.nextUrl.searchParams;
    
    const organizationId = searchParams.get('organizationId');
    const automationId = searchParams.get('automationId');
    const runId = searchParams.get('runId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 100);
    const includeSteps = searchParams.get('includeSteps') === 'true';
    
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    
    // Se pediu um run específico
    if (runId) {
      return getRunDetail(supabase, organizationId, runId, includeSteps);
    }
    
    // Listar runs
    let query = supabase
      .from('automation_runs')
      .select(`
        *,
        automations(name),
        contacts(id, email, first_name, last_name)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    if (automationId) {
      query = query.eq('automation_id', automationId);
    }
    
    if (status) {
      query = query.eq('status', status);
    }
    
    // Paginação
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    
    const { data: runs, error, count } = await query;
    
    if (error) {
      console.error('Erro ao buscar runs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Formatar resposta
    const formattedRuns = runs?.map((run: any) => ({
      id: run.id,
      automation_id: run.automation_id,
      automation_name: run.automations?.name,
      status: run.status,
      trigger_type: run.trigger_type,
      contact: run.contacts ? {
        id: run.contacts.id,
        email: run.contacts.email,
        name: `${run.contacts.first_name || ''} ${run.contacts.last_name || ''}`.trim()
      } : null,
      nodes_executed: run.nodes_executed,
      nodes_total: run.nodes_total,
      nodes_failed: run.nodes_failed,
      duration_ms: run.duration_ms,
      error_message: run.error_message,
      error_suggestion: run.error_suggestion,
      started_at: run.started_at,
      completed_at: run.completed_at
    }));
    
    return NextResponse.json({
      runs: formattedRuns,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize)
      }
    });
    
  } catch (error: any) {
    console.error('Erro na API de runs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// Detalhe de uma execução
// =============================================
async function getRunDetail(
  supabase: any, 
  organizationId: string, 
  runId: string,
  includeSteps: boolean
) {
  // Buscar run
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .select(`
      *,
      automations(name),
      contacts(id, email, first_name, last_name, phone, tags)
    `)
    .eq('id', runId)
    .eq('organization_id', organizationId)
    .single();
  
  if (runError || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  
  let steps = [];
  
  if (includeSteps) {
    const { data: stepsData } = await supabase
      .from('automation_run_steps')
      .select('*')
      .eq('run_id', runId)
      .order('step_order', { ascending: true });
    
    steps = stepsData?.map((step: any) => ({
      id: step.id,
      node_id: step.node_id,
      node_type: step.node_type,
      node_label: step.node_label,
      step_order: step.step_order,
      branch_path: step.branch_path,
      status: step.status,
      input_data: step.input_data,
      input_truncated: step.input_truncated,
      output_data: step.output_data,
      output_truncated: step.output_truncated,
      config_used: step.config_used,
      variables_resolved: step.variables_resolved,
      error: step.error_message ? {
        type: step.error_type,
        message: step.error_message,
        context: step.error_context
      } : null,
      duration_ms: step.duration_ms,
      started_at: step.started_at,
      completed_at: step.completed_at
    })) || [];
  }
  
  return NextResponse.json({
    run: {
      id: run.id,
      automation_id: run.automation_id,
      automation_name: run.automations?.name,
      status: run.status,
      trigger_type: run.trigger_type,
      trigger_data: run.trigger_data,
      contact: run.contacts ? {
        id: run.contacts.id,
        email: run.contacts.email,
        name: `${run.contacts.first_name || ''} ${run.contacts.last_name || ''}`.trim(),
        phone: run.contacts.phone,
        tags: run.contacts.tags
      } : null,
      nodes_executed: run.nodes_executed,
      nodes_total: run.nodes_total,
      nodes_failed: run.nodes_failed,
      nodes_skipped: run.nodes_skipped,
      error: run.error_message ? {
        node_id: run.error_node_id,
        type: run.error_type,
        message: run.error_message,
        suggestion: run.error_suggestion
      } : null,
      duration_ms: run.duration_ms,
      started_at: run.started_at,
      completed_at: run.completed_at
    },
    steps
  });
}

// =============================================
// POST - Reexecutar ou testar automação
// =============================================
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    
    const { action, organizationId, automationId, runId, testData } = body;
    
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    
    // Ação: reexecutar um run anterior
    if (action === 'rerun' && runId) {
      return rerunExecution(supabase, organizationId, runId);
    }
    
    // Ação: testar automação com dados de exemplo
    if (action === 'test' && automationId) {
      return testAutomation(supabase, organizationId, automationId, testData);
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error: any) {
    console.error('Erro no POST de runs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// Reexecutar uma execução anterior
// =============================================
async function rerunExecution(supabase: any, organizationId: string, runId: string) {
  // Buscar run original
  const { data: originalRun, error } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('id', runId)
    .eq('organization_id', organizationId)
    .single();
  
  if (error || !originalRun) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  
  // Buscar automação
  const { data: automation } = await supabase
    .from('automations')
    .select('*')
    .eq('id', originalRun.automation_id)
    .single();
  
  if (!automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }
  
  // TODO: Chamar engine de execução
  // Por enquanto, retornar que foi enfileirado
  
  return NextResponse.json({
    message: 'Reexecução enfileirada',
    original_run_id: runId,
    automation_id: automation.id,
    // new_run_id: newRun.id // Quando implementado
  });
}

// =============================================
// Testar automação com dados de exemplo
// =============================================
async function testAutomation(
  supabase: any, 
  organizationId: string, 
  automationId: string,
  testData?: any
) {
  // Buscar automação
  const { data: automation, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .eq('organization_id', organizationId)
    .single();
  
  if (error || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }
  
  // Buscar um contato de exemplo se não fornecido
  let contactId = testData?.contact_id;
  if (!contactId) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .limit(1);
    
    contactId = contacts?.[0]?.id;
  }
  
  // TODO: Chamar engine de execução em modo teste
  
  return NextResponse.json({
    message: 'Teste enfileirado',
    automation_id: automationId,
    test_contact_id: contactId,
    test_data: testData
  });
}

// =============================================
// DELETE - Limpar execuções antigas
// =============================================
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const searchParams = request.nextUrl.searchParams;
    
    const organizationId = searchParams.get('organizationId');
    const automationId = searchParams.get('automationId');
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30', 10);
    
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    let query = supabase
      .from('automation_runs')
      .delete()
      .eq('organization_id', organizationId)
      .lt('created_at', cutoffDate.toISOString());
    
    if (automationId) {
      query = query.eq('automation_id', automationId);
    }
    
    const { error, count } = await query;
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      message: 'Execuções removidas',
      deleted_count: count || 0,
      older_than: cutoffDate.toISOString()
    });
    
  } catch (error: any) {
    console.error('Erro ao deletar runs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
